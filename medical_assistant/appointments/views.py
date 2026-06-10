from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from .models import Appointment
from .serializers import AppointmentSerializer, AppointmentDetailSerializer
from availability.models import Availability

class AppointmentViewSet(viewsets.ModelViewSet):
    queryset = Appointment.objects.all()

    def get_serializer_class(self):
        if self.action in ['retrieve', 'list']:
            return AppointmentDetailSerializer
        return AppointmentSerializer

    def get_permissions(self):
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if user.is_staff or user.role == 'ADMIN':
            return Appointment.objects.all()
        
        # Doctors can see slots booked with them
        if user.role == 'DOCTOR':
            return Appointment.objects.filter(doctor__email=user.email)
            
        # Patients can see their own bookings
        return Appointment.objects.filter(patient__user=user)

    @transaction.atomic
    def perform_destroy(self, instance):
        # When deleting an appointment completely, set corresponding vacancy slot to AVAILABLE
        try:
            slot = Availability.objects.get(
                doctor=instance.doctor,
                date=instance.appointment_date,
                start_time=instance.appointment_time
            )
            slot.slot_status = Availability.Status.AVAILABLE
            slot.save()
        except Availability.DoesNotExist:
            pass
        instance.delete()

    @action(detail=True, methods=['post'], url_path='cancel')
    @transaction.atomic
    def cancel_appointment(self, request, pk=None):
        appointment = self.get_object()
        if appointment.status == Appointment.Status.CANCELLED:
            return Response({"detail": "Appointment is already cancelled."}, status=status.HTTP_400_BAD_REQUEST)
        
        appointment.status = Appointment.Status.CANCELLED
        appointment.save()

        # Free the slot
        try:
            slot = Availability.objects.get(
                doctor=appointment.doctor,
                date=appointment.appointment_date,
                start_time=appointment.appointment_time
            )
            slot.slot_status = Availability.Status.AVAILABLE
            slot.save()
        except Availability.DoesNotExist:
            pass

        return Response({"detail": "Appointment cancelled successfully.", "status": appointment.status})

    @action(detail=True, methods=['post'], url_path='reschedule')
    @transaction.atomic
    def reschedule_appointment(self, request, pk=None):
        appointment = self.get_object()
        new_date = request.data.get('appointment_date')
        new_time = request.data.get('appointment_time')

        if not new_date or not new_time:
            return Response({"detail": "appointment_date and appointment_time are required."}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Look up the new slot
        new_slot = Availability.objects.filter(
            doctor=appointment.doctor,
            date=new_date,
            start_time=new_time,
        ).first()

        if not new_slot:
            return Response({"detail": "The requested doctor availability slot does not exist."}, status=status.HTTP_404_NOT_FOUND)

        if new_slot.slot_status != Availability.Status.AVAILABLE:
            return Response({"detail": "The requested slot is not available."}, status=status.HTTP_400_BAD_REQUEST)

        # 2. Release the old slot
        try:
            old_slot = Availability.objects.get(
                doctor=appointment.doctor,
                date=appointment.appointment_date,
                start_time=appointment.appointment_time
            )
            old_slot.slot_status = Availability.Status.AVAILABLE
            old_slot.save()
        except Availability.DoesNotExist:
            pass

        # 3. Book the new slot
        new_slot.slot_status = Availability.Status.BOOKED
        new_slot.save()

        # 4. Update the appointment values
        appointment.appointment_date = new_date
        appointment.appointment_time = new_time
        appointment.status = Appointment.Status.RESCHEDULED
        appointment.save()

        serializer = AppointmentDetailSerializer(appointment)
        return Response(serializer.data, status=status.HTTP_200_OK)
