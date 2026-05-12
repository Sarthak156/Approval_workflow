from rest_framework import serializers
from .models import ApprovalRequest, ApprovalAction


class ApprovalActionSerializer(serializers.ModelSerializer):
    acted_by = serializers.StringRelatedField()

    class Meta:
        model = ApprovalAction
        fields = ['id', 'action', 'comments', 'acted_by', 'created_at']


class ApprovalRequestSerializer(serializers.ModelSerializer):
    actions = ApprovalActionSerializer(many=True, read_only=True)
    submitted_by = serializers.StringRelatedField()
    request_id = serializers.CharField(read_only=True)

    class Meta:
        model = ApprovalRequest
        fields = ['id', 'request_id', 'document_name', 'document_description', 'request_message', 'document', 'submitted_by', 'status', 'lower_approved', 'middle_approved', 'higher_approved', 'rejection_reason', 'created_at', 'actions']
        read_only_fields = ['status', 'lower_approved', 'middle_approved', 'higher_approved', 'rejection_reason', 'created_at', 'actions', 'submitted_by', 'request_id']
        extra_kwargs = {
            'document_name': {'required': True, 'allow_blank': False},
            'document_description': {'required': True, 'allow_blank': False},
            'request_message': {'required': True, 'allow_blank': False},
            'document': {'required': True},
        }

    def validate(self, attrs):
        required_fields = ['document_name', 'document_description', 'request_message', 'document']
        missing = [field for field in required_fields if not attrs.get(field)]
        if missing:
            raise serializers.ValidationError({field: 'This field is required.' for field in missing})
        return attrs
