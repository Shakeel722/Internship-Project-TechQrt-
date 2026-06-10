from django.contrib import admin
from .models import ConversationLog

@admin.register(ConversationLog)
class ConversationLogAdmin(admin.ModelAdmin):
    list_display = ('id', 'session_id', 'message_summary', 'intent', 'timestamp')
    list_filter = ('intent', 'timestamp')
    search_fields = ('session_id', 'message', 'response')
    readonly_fields = ('session_id', 'message', 'response', 'intent', 'entities', 'timestamp')

    def message_summary(self, obj):
        return obj.message[:50] + "..." if len(obj.message) > 50 else obj.message
    message_summary.short_description = 'User Message'
