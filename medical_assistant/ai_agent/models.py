from django.db import models
from django.conf import settings

class ConversationLog(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='conversation_logs'
    )
    session_id = models.CharField(max_length=255, db_index=True)
    message = models.TextField()
    response = models.TextField()
    intent = models.CharField(max_length=50, null=True, blank=True)
    entities = models.JSONField(default=dict, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"Session {self.session_id} - User: {self.message[:30]} -> Intent: {self.intent}"
