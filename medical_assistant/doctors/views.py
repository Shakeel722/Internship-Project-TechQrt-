from rest_framework import viewsets, permissions, filters
from .models import Doctor
from .serializers import DoctorSerializer, DoctorDetailSerializer

class DoctorViewSet(viewsets.ModelViewSet):
    queryset = Doctor.objects.all()
    filter_backends = [filters.SearchFilter]
    search_fields = ['specialization', 'name', 'hospital__name']

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return DoctorDetailSerializer
        return DoctorSerializer

    def get_permissions(self):
        # Admin or Doctor can add, update, delete
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [permissions.IsAdminUser()]
        # Patients can view
        return [permissions.IsAuthenticatedOrReadOnly()]
