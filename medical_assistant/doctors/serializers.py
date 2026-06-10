from rest_framework import serializers
from .models import Doctor
from hospitals.serializers import HospitalSerializer

class DoctorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Doctor
        fields = '__all__'


class DoctorDetailSerializer(serializers.ModelSerializer):
    hospital_details = HospitalSerializer(source='hospital', read_only=True)

    class Meta:
        model = Doctor
        fields = ('id', 'name', 'specialization', 'experience_years', 'consultation_fee', 'hospital', 'hospital_details', 'phone', 'email')
