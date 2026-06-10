from django.contrib import admin
from .models import Availability

@admin.register(Availability)
class AvailabilityAdmin(admin.ModelAdmin):
    list_display = ('id', 'doctor', 'date', 'start_time', 'end_time', 'slot_status')
    list_filter = ('date', 'slot_status', 'doctor')
    search_fields = ('doctor__name', 'date')
