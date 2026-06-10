from django.db import models
from django.core.exceptions import ValidationError
from doctors.models import Doctor

class Availability(models.Model):
    class Status(models.TextChoices):
        AVAILABLE = 'AVAILABLE', 'Available'
        BOOKED = 'BOOKED', 'Booked'
        RESERVED = 'RESERVED', 'Reserved'

    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name='availabilities', db_index=True)
    date = models.DateField(db_index=True)
    start_time = models.TimeField()
    end_time = models.TimeField()
    slot_status = models.CharField(
        max_length=15, 
        choices=Status.choices, 
        default=Status.AVAILABLE
    )

    class Meta:
        verbose_name_plural = "Availabilities"
        # Unique constraint to prevent creating duplicate slots for the same doctor at the exact same time
        unique_together = ('doctor', 'date', 'start_time')
        indexes = [
            models.Index(fields=['doctor', 'date']),
        ]

    def clean(self):
        if self.start_time >= self.end_time:
            raise ValidationError("Start time must be strictly before end time.")

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.doctor.name} - {self.date} [{self.start_time}-{self.end_time}] ({self.slot_status})"
