from rest_framework import serializers
from .models import Patient

class PatientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = ('id', 'user', 'name', 'phone', 'email', 'age', 'gender')
        read_only_fields = ('user',)
