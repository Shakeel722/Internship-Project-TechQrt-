from django.db import models

class Hospital(models.Model):
    name = models.CharField(max_length=255, db_index=True)
    address = models.TextField()
    phone = models.CharField(max_length=20)

    def __str__(self):
        return self.name
