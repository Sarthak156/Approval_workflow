from django.contrib import admin
from .models import ApprovalRequest, ApprovalAction, UserProfile


@admin.register(ApprovalRequest)
class ApprovalRequestAdmin(admin.ModelAdmin):
    list_display = ('request_id', 'document_name', 'submitted_by', 'status', 'created_at')


@admin.register(ApprovalAction)
class ApprovalActionAdmin(admin.ModelAdmin):
    list_display = ('request', 'acted_by', 'action', 'created_at')


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role')
