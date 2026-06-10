"""
URL configuration for medical_assistant project.
Registers URLs for Accounts, Hospitals, Doctors, Patients, Availability, Appointments, and AI Agent.
"""
from django.contrib import admin
from django.urls import path, include
from rest_framework import permissions

urlpatterns = [
    path('admin/', admin.site.get_admin_urls() if hasattr(admin.site, 'get_admin_urls') else admin.site.urls),
    
    # Simple JWT Auth endpoints
    path('api/accounts/', include('accounts.urls')),
    
    # Core Medical service APIs
    path('api/hospitals/', include('hospitals.urls')),
    path('api/doctors/', include('doctors.urls')),
    path('api/patients/', include('patients.urls')),
    path('api/availability/', include('availability.urls')),
    path('api/appointments/', include('appointments.urls')),
    
    # Conversational AI voice agent service endpoint
    path('api/ai-agent/', include('ai_agent.urls')),
]
