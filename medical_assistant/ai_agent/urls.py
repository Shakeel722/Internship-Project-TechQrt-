from django.urls import path
from .views import VoiceAgentView

urlpatterns = [
    path('chat/', VoiceAgentView.as_view(), name='voice_agent_chat'),
]
