from rest_framework import serializers
from .models import Availability
from doctors.serializers import DoctorSerializer

class AvailabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Availability
        fields = '__all__'

    def validate(self, attrs):
        start_time = attrs.get('start_time')
        end_time = attrs.get('end_time')
        date = attrs.get('date')
        doctor = attrs.get('doctor')

        if start_time and end_time and start_time >= end_time:
            raise serializers.ValidationError("start_time must be before end_time.")

        # Check overlapping slots for the same doctor
        overlapping = Availability.objects.filter(
            doctor=doctor,
            date=date,
            start_time__lt=end_time,
            end_time__gt=start_time
        )
        
        # If updating, exclude the current instance
        if self.instance:
            overlapping = overlapping.exclude(pk=self.instance.pk)

        if overlapping.exists():
            raise serializers.ValidationError("An availability slot already overlaps with this time range for this doctor.")

        return attrs


class AvailabilityDetailSerializer(serializers.ModelSerializer):
    doctor_details = DoctorSerializer(source='doctor', read_only=True)

    class Meta:
        model = Availability
        fields = ('id', 'doctor', 'doctor_details', 'date', 'start_time', 'end_time', 'slot_status')
