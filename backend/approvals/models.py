from django.db import models
from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone


def generate_request_id():
    date = timezone.now().strftime('%Y%m%d')
    # simple incremental suffix using timestamp
    suffix = timezone.now().strftime('%H%M%S')
    return f'REQ-{date}-{suffix}'


class ApprovalRequest(models.Model):
    STATUS_CHOICES = [
        ('PENDING_LOWER', 'Pending Lower'),
        ('PENDING_MIDDLE', 'Pending Middle'),
        ('PENDING_HIGHER', 'Pending Higher'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
    ]

    request_id = models.CharField(max_length=50, unique=True, default=generate_request_id)
    document_name = models.CharField(max_length=255)
    document_description = models.TextField(blank=True)
    request_message = models.TextField(blank=True)
    document = models.FileField(upload_to='documents/', null=True, blank=True)
    submitted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING_LOWER')
    lower_approved = models.BooleanField(default=False)
    middle_approved = models.BooleanField(default=False)
    higher_approved = models.BooleanField(default=False)
    rejection_reason = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.request_id


class ApprovalAction(models.Model):
    ACTION_CHOICES = [
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
        ('FORWARDED', 'Forwarded'),
    ]

    request = models.ForeignKey(ApprovalRequest, related_name='actions', on_delete=models.CASCADE)
    acted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    action = models.CharField(max_length=10, choices=ACTION_CHOICES)
    comments = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.request.request_id} - {self.action}'


class UserProfile(models.Model):
    ROLE_CHOICES = [
        ('USER', 'User'),
        ('LOWER', 'Lower Level Approver'),
        ('MIDDLE', 'Middle Level Approver'),
        ('HIGHER', 'Higher Level Approver'),
    ]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='USER')

    def __str__(self):
        return f'{self.user.username} ({self.role})'


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)

