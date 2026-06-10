from django.contrib import admin
from .models import Doctor

@admin.register(Doctor)
class DoctorAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'specialization', 'experience_years', 'consultation_fee', 'hospital', 'email')
    list_filter = ('specialization', 'hospital', 'experience_years')
    search_fields = ('name', 'specialization', 'hospital__name', 'email')
