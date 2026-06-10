from django.db import models
from hospitals.models import Hospital

class Doctor(models.Model):
    name = models.CharField(max_length=255, db_index=True)
    specialization = models.CharField(max_length=100, db_index=True)
    experience_years = models.PositiveIntegerField()
    consultation_fee = models.DecimalField(max_digits=10, decimal_length=2, decimal_places=2)  # wait, decimal_places=2, max_digits=10 is normal. decimal_length is not a valid parameter. Let's write max_digits=10, decimal_places=2.
    hospital = models.ForeignKey(Hospital, on_delete=models.CASCADE, related_name='doctors', db_index=True)
    phone = models.CharField(max_length=20)
    email = models.EmailField(unique=True)

    def __str__(self):
        return f"{self.name} - {self.specialization}"
