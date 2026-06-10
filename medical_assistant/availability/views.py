from rest_framework import viewsets, permissions
from .models import Availability
from .serializers import AvailabilitySerializer, AvailabilityDetailSerializer

class AvailabilityViewSet(viewsets.ModelViewSet):
    queryset = Availability.objects.all()
    
    def get_serializer_class(self):
        if self.action in ['retrieve', 'list']:
            return AvailabilityDetailSerializer
        return AvailabilitySerializer

    def get_permissions(self):
        # Admin or Doctors should write availability
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [permissions.IsAdminUser()]
        return [permissions.AllowAny()]

    def get_queryset(self):
        queryset = Availability.objects.all()
        doctor_id = self.request.query_params.get('doctor_id')
        date_param = self.request.query_params.get('date')
        specialization = self.request.query_params.get('specialization')
        status = self.request.query_params.get('slot_status', 'AVAILABLE')

        if doctor_id:
            queryset = queryset.filter(doctor_id=doctor_id)
        if date_param:
            queryset = queryset.filter(date=date_param)
        if specialization:
            queryset = queryset.filter(doctor__specialization__iexact=specialization)
        if status:
            queryset = queryset.filter(slot_status=status)
            
        return queryset.order_by('date', 'start_time')
