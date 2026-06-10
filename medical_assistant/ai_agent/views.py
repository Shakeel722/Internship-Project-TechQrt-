import json
import re
from datetime import datetime, date, timedelta
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status
from doctors.models import Doctor
from availability.models import Availability
from appointments.models import Appointment
from patients.models import Patient
from .models import ConversationLog

class VoiceAgentView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        session_id = request.data.get('session_id') or request.META.get('HTTP_X_SESSION_ID') or 'default-session'
        message = request.data.get('message', '').strip()
        user = request.user if request.user.is_authenticated else None

        if not message:
            return Response({"detail": "Message parameter is required."}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Fetch conversation history for state management
        history = ConversationLog.objects.filter(session_id=session_id).order_by('timestamp')
        
        # Accumulate extracted entities from past turns of this session
        session_context = {}
        for turn in history:
            if turn.entities:
                session_context.update(turn.entities)

        # 2. Heuristic Intent Detection
        intent = self.detect_intent(message, session_context)
        
        # 3. Dynamic Entity Extraction
        extracted = self.extract_entities(message)
        session_context.update({k: v for k, v in extracted.items() if v is not None})

        # 4. Process State Machine logic based on active Intent
        bot_response, final_intent = self.process_conversation(intent, message, session_context, user)

        # 5. Log the turn to PostgreSQL database
        ConversationLog.objects.create(
            user=user if user and user.is_authenticated else None,
            session_id=session_id,
            message=message,
            response=bot_response,
            intent=final_intent or intent,
            entities=session_context
        )

        return Response({
            "session_id": session_id,
            "intent": final_intent or intent,
            "extracted_entities": session_context,
            "response": bot_response
        }, status=status.HTTP_200_OK)

    def detect_intent(self, msg, context):
        msg_lower = msg.lower()
        
        # If there's an ongoing booking flow and user says general confirmation affirmative/negative
        if context.get('booking_step') == 'awaiting_confirmation':
            if any(yes in msg_lower for yes in ['yes', 'confirm', 'book it', 'go ahead', 'okay', 'sure', 'yeah']):
                return "CONFIRM_BOOKING"
            if any(no in msg_lower for no in ['no', 'cancel', 'stop', 'dont']):
                return "CANCEL_FLOW"

        if any(w in msg_lower for w in ['book', 'schedule', 'reserve', 'make an appointment', 'need an appointment']):
            return "BOOK_APPOINTMENT"
        if any(w in msg_lower for w in ['reschedule', 'change', 'move', 'shift']):
            return "RESCHEDULE_APPOINTMENT"
        if any(w in msg_lower for w in ['cancel', 'remove', 'delete appointment']):
            return "CANCEL_APPOINTMENT"
        if any(w in msg_lower for w in ['available', 'slots', 'free time', 'when is', 'check availability']):
            return "CHECK_AVAILABILITY"
        if any(w in msg_lower for w in ['find', 'search', 'doctor', 'specialist', 'dermatologist', 'cardiologist', 'pediatrician', 'physician']):
            return "FIND_DOCTOR"
        
        # Fallback to session context state if in-progress
        if context.get('active_intent'):
            return context.get('active_intent')

        return "GENERAL_GREETING"

    def extract_entities(self, msg):
        msg_lower = msg.lower()
        entities = {
            "specialization": None,
            "doctor_name": None,
            "date": None,
            "time": None
        }

        # Specialization Parsing
        for spec in ['Dermatologist', 'Cardiologist', 'Pediatrician', 'General Physician', 'Orthopedic']:
            if spec.lower() in msg_lower or (spec == 'General Physician' and 'physician' in msg_lower):
                entities["specialization"] = spec
        if 'skin' in msg_lower:
            entities["specialization"] = 'Dermatologist'
        if 'heart' in msg_lower:
            entities["specialization"] = 'Cardiologist'
        if 'child' in msg_lower or 'kid' in msg_lower:
            entities["specialization"] = 'Pediatrician'

        # Doctor Names (mock matches)
        for doc in ['Sharma', 'Patel', 'Smith', 'Jones', 'Verma', 'Kumar']:
            if doc.lower() in msg_lower:
                entities["doctor_name"] = f"Dr. {doc}"

        # Date Parsing
        today_date = date.today()
        if 'tomorrow' in msg_lower:
            entities["date"] = (today_date + timedelta(days=1)).isoformat()
        elif 'today' in msg_lower:
            entities["date"] = today_date.isoformat()
        else:
            # Check for date match like YYYY-MM-DD
            match = re.search(r'\d{4}-\d{2}-\d{2}', msg)
            if match:
                entities["date"] = match.group(0)

        # Time Parsing
        time_match = re.search(r'(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)?', msg)
        if time_match:
            hours = int(time_match.group(1))
            minutes = int(time_match.group(2))
            meridiem = time_match.group(3)
            if meridiem:
                meridiem = meridiem.lower()
                if meridiem == 'pm' and hours < 12:
                    hours += 12
                elif meridiem == 'am' and hours == 12:
                    hours = 0
            entities["time"] = f"{hours:02d}:{minutes:02d}:00"
        elif '11:00 am' in msg_lower or '11 am' in msg_lower:
            entities["time"] = "11:00:00"
        elif '2:00 pm' in msg_lower or '2 pm' in msg_lower:
            entities["time"] = "14:00:00"

        return entities

    def process_conversation(self, intent, msg, context, user):
        context['active_intent'] = intent

        # Intent: Find Doctor
        if intent == "FIND_DOCTOR":
            spec = context.get('specialization')
            if not spec:
                return "Which specialist or field are you looking for? (e.g. Dermatologist, Cardiologist, Pediatrician)", intent
            
            docs = Doctor.objects.filter(specialization__icontains=spec)
            if not docs.exists():
                return f"I couldn't find any specialists registered under {spec} at the moment.", intent
            
            names = [f"{doc.name} of {doc.hospital.name}" for doc in docs]
            context['booking_step'] = 'resolved_doctor'
            return f"I found {len(docs)} {spec}(s): {', '.join(names)}. Which of these doctors would you like to check availability for?", intent

        # Intent: Check Availability
        elif intent == "CHECK_AVAILABILITY":
            spec = context.get('specialization')
            doc_name = context.get('doctor_name')
            target_date = context.get('date')

            # Lookup doctor logic
            queryset = Availability.objects.filter(slot_status='AVAILABLE')
            if doc_name:
                cleaned_name = doc_name.replace("Dr. ", "")
                queryset = queryset.filter(doctor__name__icontains=cleaned_name)
            elif spec:
                queryset = queryset.filter(doctor__specialization__icontains=spec)
            
            if target_date:
                queryset = queryset.filter(date=target_date)

            if not queryset.exists():
                name_ref = doc_name or (f"a {spec}" if spec else "doctors")
                date_ref = f"for {target_date}" if target_date else "tomorrow"
                return f"I'm sorry, I couldn't find any available slots with {name_ref} {date_ref}.", intent

            slots_summary = []
            for slot in queryset[:3]:
                slots_summary.append(f"{slot.doctor.name} at {slot.start_time.strftime('%I:%M %p')} on {slot.date}")
            
            # Select first found if not specified
            matched_slot = queryset.first()
            context['selected_doctor_id'] = matched_slot.doctor.id
            context['date'] = matched_slot.date.isoformat()
            context['time'] = matched_slot.start_time.isoformat()
            context['doctor_name'] = matched_slot.doctor.name

            return f"I found availability. For example, {', and '.join(slots_summary)}. Would you like me to book it?", intent

        # Intent: Booking Appointment Flow
        elif intent == "BOOK_APPOINTMENT":
            spec = context.get('specialization')
            doc_name = context.get('doctor_name')
            target_date = context.get('date')
            target_time = context.get('time')

            if not spec and not doc_name:
                return "Certainly. What kind of medical specialist do you need, or do you have a specific doctor in mind?", intent
            
            if not target_date:
                # Prompt date tomorrow
                tomorrow = (date.today() + timedelta(days=1)).isoformat()
                context['date'] = tomorrow
                target_date = tomorrow

            # Lock Doctor
            doctor = None
            if doc_name:
                cleaned = doc_name.replace("Dr. ", "")
                doctor = Doctor.objects.filter(name__icontains=cleaned).first()
            elif spec:
                doctor = Doctor.objects.filter(specialization__icontains=spec).first()

            if not doctor:
                return f"I couldn't locate a doctor matching {doc_name or spec}. Please tell me if you have another doctor's name.", intent

            context['selected_doctor_id'] = doctor.id
            context['doctor_name'] = doctor.name

            # Check slots
            slots_query = Availability.objects.filter(doctor=doctor, date=target_date, slot_status='AVAILABLE')
            if target_time:
                best_slot = slots_query.filter(start_time=target_time).first()
            else:
                best_slot = slots_query.first()

            if not best_slot:
                other_slots = Availability.objects.filter(doctor=doctor, slot_status='AVAILABLE').order_by('date','start_time')[:2]
                if other_slots.exists():
                    alternatives = [f"{s.date} at {s.start_time.strftime('%I:%M %p')}" for s in other_slots]
                    return f"Dr. {doctor.name} is not available on {target_date} at the requested time. However, they have active slots on: {', '.join(alternatives)}. Would you like to select one?", intent
                return f"Dr. {doctor.name} has no available booking slots at this time.", intent

            context['time'] = best_slot.start_time.isoformat()
            context['booking_step'] = 'awaiting_confirmation'

            return f"I found {doctor.name} ({doctor.specialization}) available tomorrow on {target_date} at {best_slot.start_time.strftime('%I:%M %p')}. Would you like me to confirm the appointment?", intent

        # Confirm booking step
        elif intent == "CONFIRM_BOOKING":
            doc_id = context.get('selected_doctor_id')
            appt_date = context.get('date')
            appt_time = context.get('time')

            if not doc_id or not appt_date or not appt_time:
                return "I lost track of our booking details. Could you repeat which doctor and time you wanted?", intent

            # Perform actual reservation in database
            try:
                doctor = Doctor.objects.get(id=doc_id)
                
                # Fetch or create a default Patient model if user has none
                patient = None
                if user and hasattr(user, 'patient_profile'):
                    patient = user.patient_profile
                else:
                    # Seed/Fallback patient for demo
                    patient, created = Patient.objects.get_or_create(
                        email="demo_patient@example.com",
                        defaults={
                            "name": "Demo Patient",
                            "phone": "+15551234567",
                            "age": 30,
                            "gender": "Male",
                            # Assign to admin or create a placeholder user if authenticated is null
                        }
                    )
                    # If this is an authenticated user who just has no patient profile yet, link it
                    if user and created:
                        patient.user = user
                        patient.save()

                # Atomically Book
                with transaction.atomic():
                    # 1. Update availability slot
                    slot = Availability.objects.get(doctor=doctor, date=appt_date, start_time=appt_time)
                    if slot.slot_status != Availability.Status.AVAILABLE:
                        return "I'm sorry, that appointment slot was booked in the meantime. Please check other available times.", intent
                    
                    slot.slot_status = Availability.Status.BOOKED
                    slot.save()

                    # 2. Create appointment
                    appt = Appointment.objects.create(
                        patient=patient,
                        doctor=doctor,
                        appointment_date=appt_date,
                        appointment_time=appt_time,
                        status=Appointment.Status.SCHEDULED
                    )

                # Reset booking state variables
                context['booking_step'] = 'finished'
                context['active_intent'] = None
                context['latest_appointment_id'] = appt.id

                return f"Excellent! Your appointment with {doctor.name} has been booked successfully for {appt_date} at {datetime.strptime(appt_time, '%H:%M:%S').strftime('%I:%M %p')}. Your appointment reference ID or slot number is #{appt.id}.", "CONFIRM_BOOKING"

            except Exception as e:
                return f"An operational error occurred during database reservation: {str(e)}", intent

        elif intent == "CANCEL_FLOW" or intent == "CANCEL_APPOINTMENT":
            # Clear booking state
            context['booking_step'] = None
            context['active_intent'] = None
            return "Booking process canceled. Let me know if you need any other assistance.", "CANCEL_FLOW"

        # General Greeting
        else:
            return "Hello! I am your AI Voice Doctor Assistant. I can help search for doctors, check availability, book, reschedule, or cancel your medical appointments. How can I help you today?", "GENERAL_GREETING"
