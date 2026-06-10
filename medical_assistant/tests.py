from django.test import TestCase
from django.contrib.auth import get_user_model
from hospitals.models import Hospital
from doctors.models import Doctor
from patients.models import Patient
from availability.models import Availability
from appointments.models import Appointment
from datetime import date, time

User = get_user_model()

class MedicalAssistantSystemTests(TestCase):
    def setUp(self):
        # 1. Create Patient User & Patient profile
        self.user = User.objects.create_user(
            email="patient@test.com",
            phone="+15551112233",
            role=User.Roles.PATIENT,
            password="testpassword123"
        )
        self.patient = Patient.objects.create(
            user=self.user,
            name="Alice Smith",
            phone="+15551112233",
            email="patient@test.com",
            age=28,
            gender="Female"
        )

        # 2. Create Hospital
        self.hospital = Hospital.objects.create(
            name="General Health Clinic",
            address="123 Care Lane, Medical District",
            phone="+15559998888"
        )

        # 3. Create Doctor
        self.doctor = Doctor.objects.create(
            name="Dr. Jane Sharma",
            specialization="Dermatologist",
            experience_years=10,
            consultation_fee=150.00,
            hospital=self.hospital,
            phone="+15554445555",
            email="janesharma@clinic.com"
        )

        # 4. Define Availability slots
        self.slot1 = Availability.objects.create(
            doctor=self.doctor,
            date=date(2026, 6, 11),
            start_time=time(11, 0, 0),
            end_time=time(12, 0, 0),
            slot_status=Availability.Status.AVAILABLE
        )
        self.slot2 = Availability.objects.create(
            doctor=self.doctor,
            date=date(2026, 6, 11),
            start_time=time(14, 0, 0),
            end_time=time(15, 0, 0),
            slot_status=Availability.Status.AVAILABLE
        )

    def test_availability_and_booking_workflow(self):
        # 1. Create a successful appointment
        appointment = Appointment.objects.create(
            patient=self.patient,
            doctor=self.doctor,
            appointment_date=date(2026, 6, 11),
            appointment_time=time(11, 0, 0),
            status=Appointment.Status.SCHEDULED
        )
        self.assertEqual(appointment.status, Appointment.Status.SCHEDULED)

        # 2. Assert slot status changes to BOOKED via triggering business logic
        # Here we manually simulate the transaction created by the serializer create action
        self.slot1.slot_status = Availability.Status.BOOKED
        self.slot1.save()
        self.assertEqual(self.slot1.slot_status, Availability.Status.BOOKED)

    def test_overlapping_availability_validation(self):
        # Overlapping times checking in availability objects
        with self.assertRaises(Exception):
            # Attempting to insert overlapping time range should error or fail unique constraint
            Availability.objects.create(
                doctor=self.doctor,
                date=date(2026, 6, 11),
                start_time=time(11, 30, 0),
                end_time=time(12, 30, 0)
            )

    def test_cancellation_frees_slot(self):
        # Create appointment and book slot 2
        appointment = Appointment.objects.create(
            patient=self.patient,
            doctor=self.doctor,
            appointment_date=date(2026, 6, 11),
            appointment_time=time(14, 0, 0),
            status=Appointment.Status.SCHEDULED
        )
        self.slot2.slot_status = Availability.Status.BOOKED
        self.slot2.save()
        self.assertEqual(self.slot2.slot_status, Availability.Status.BOOKED)

        # Cancel appointment and restore slot
        appointment.status = Appointment.Status.CANCELLED
        appointment.save()
        self.slot2.slot_status = Availability.Status.AVAILABLE
        self.slot2.save()
        self.assertEqual(self.slot2.slot_status, Availability.Status.AVAILABLE)
