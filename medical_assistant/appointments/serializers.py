from rest_framework import serializers
from .models import Appointment
from availability.models import Availability
from patients.models import Patient
from doctors.models import Doctor
from patients.serializers import PatientSerializer
from doctors.serializers import DoctorSerializer
from django.db import transaction

class AppointmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Appointment
        fields = '__all__'

    def validate(self, attrs):
        patient = attrs.get('patient')
        doctor = attrs.get('doctor')
        date = attrs.get('appointment_date')
        time = attrs.get('appointment_time')
        current_status = attrs.get('status', Appointment.Status.SCHEDULED)

        # 1. Verify doctor availability schedule exists for this slot
        availability_slot = Availability.objects.filter(
            doctor=doctor,
            date=date,
            start_time=time,
        ).first()

        if not availability_slot:
            raise serializers.ValidationError(
                "No availability slot defined for this doctor at the chosen date and time."
            )

        if availability_slot.slot_status != Availability.Status.AVAILABLE and current_status == Appointment.Status.SCHEDULED:
            # Skip if this is the appointment itself being updated
            if not self.instance:
                raise serializers.ValidationError("This doctor availability slot is already booked or reserved.")

        # 2. Prevent patient double-booking at the exact same hour
        patient_conflicts = Appointment.objects.filter(
            patient=patient,
            appointment_date=date,
            appointment_time=time,
            status__in=[Appointment.Status.SCHEDULED, Appointment.Status.RESCHEDULED]
        )
        if self.instance:
            patient_conflicts = patient_conflicts.exclude(pk=self.instance.pk)
        
        if patient_conflicts.exists():
            raise serializers.ValidationError("The patient already has an active appointment scheduled at this exact time.")

        # 3. Prevent doctor double-booking
        doctor_conflicts = Appointment.objects.filter(
            doctor=doctor,
            appointment_date=date,
            appointment_time=time,
            status__in=[Appointment.Status.SCHEDULED, Appointment.Status.RESCHEDULED]
        )
        if self.instance:
            doctor_conflicts = doctor_conflicts.exclude(pk=self.instance.pk)
            
        if doctor_conflicts.exists():
            raise serializers.ValidationError("This doctor already has a confirmed booking at this exact time.")

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        doctor = validated_data['doctor']
        date = validated_data['appointment_date']
        time = validated_data['appointment_time']

        # Book the matching slot
        availability_slot = Availability.objects.get(
            doctor=doctor,
            date=date,
            start_time=time,
        )
        availability_slot.slot_status = Availability.Status.BOOKED
        availability_slot.save()

        return super().create(validated_data)


class AppointmentDetailSerializer(serializers.ModelSerializer):
    patient_details = PatientSerializer(source='patient', read_only=True)
    doctor_details = DoctorSerializer(source='doctor', read_only=True)

    class Meta:
        model = Appointment
        fields = ('id', 'patient', 'patient_details', 'doctor', 'doctor_details', 'appointment_date', 'appointment_time', 'status', 'created_at', 'updated_at')
