from rest_framework import serializers
from .models import ConversationLog

class ConversationLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConversationLog
        fields = '__all__'
