from django.contrib import admin
from .models import Patient

@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'phone', 'email', 'age', 'gender')
    list_filter = ('gender', 'age')
    search_fields = ('name', 'email', 'phone')
