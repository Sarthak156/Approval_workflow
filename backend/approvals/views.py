from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticatedOrReadOnly, IsAdminUser
from rest_framework.views import APIView
from django.contrib.auth import get_user_model
from .models import ApprovalRequest, ApprovalAction, UserProfile
from .serializers import ApprovalRequestSerializer
from .services import ensure_can_handle_request, submission_route_for_role, visible_request_roles_for_user

User = get_user_model()


class ApprovalRequestViewSet(viewsets.ModelViewSet):
    queryset = ApprovalRequest.objects.all().order_by('-created_at')
    serializer_class = ApprovalRequestSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

    def perform_create(self, serializer):
        approval_request = serializer.save(submitted_by=self.request.user)
        submitter_role = 'USER'
        if self.request.user.is_superuser or self.request.user.is_staff:
            submitter_role = 'HIGHER'
        else:
            submitter_role = getattr(getattr(self.request.user, 'profile', None), 'role', 'USER')

        approval_request.status = submission_route_for_role(submitter_role)
        approval_request.save(update_fields=['status'])

        if approval_request.status == 'APPROVED':
            approval_request.higher_approved = True
            approval_request.save(update_fields=['higher_approved'])
            ApprovalAction.objects.create(
                request=approval_request,
                acted_by=self.request.user,
                action='APPROVED',
                comments='Auto-approved on submission for higher-level user.',
            )

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if not user.is_authenticated:
            return queryset.none()
        if user.is_superuser or user.is_staff:
            return queryset

        visible_roles = visible_request_roles_for_user(user)
        return queryset.filter(submitted_by__profile__role__in=visible_roles)

    @action(detail=False, methods=['get'])
    def my(self, request):
        queryset = self.get_queryset().filter(submitted_by=request.user) if request.user.is_authenticated else ApprovalRequest.objects.none()
        return Response(self.get_serializer(queryset, many=True).data)

    @action(detail=False, methods=['get'])
    def pending(self, request):
        queryset = self.get_queryset().filter(status__in=['PENDING_LOWER', 'PENDING_MIDDLE', 'PENDING_HIGHER'])
        return Response(self.get_serializer(queryset, many=True).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        req = self.get_object()
        ensure_can_handle_request(request.user, req)
        if req.status == 'PENDING_LOWER':
            req.lower_approved = True
            req.status = 'PENDING_MIDDLE'
        elif req.status == 'PENDING_MIDDLE':
            req.middle_approved = True
            req.status = 'PENDING_HIGHER'
        elif req.status == 'PENDING_HIGHER':
            req.higher_approved = True
            req.status = 'APPROVED'
        req.save()
        ApprovalAction.objects.create(request=req, acted_by=request.user if request.user.is_authenticated else None, action='APPROVED')
        return Response(self.get_serializer(req).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        req = self.get_object()
        ensure_can_handle_request(request.user, req)
        req.status = 'REJECTED'
        req.rejection_reason = request.data.get('reason', '')
        req.save()
        ApprovalAction.objects.create(request=req, acted_by=request.user if request.user.is_authenticated else None, action='REJECTED', comments=req.rejection_reason)
        return Response(self.get_serializer(req).data)


class MeView(APIView):
    def get(self, request):
        if not request.user.is_authenticated:
            return Response({'authenticated': False})
        if request.user.is_superuser or request.user.is_staff:
            return Response({
                'authenticated': True,
                'username': request.user.username,
                'role': 'ADMIN',
                'is_admin': True,
            })
        return Response({
            'authenticated': True,
            'username': request.user.username,
            'role': getattr(getattr(request.user, 'profile', None), 'role', 'USER'),
            'is_admin': False,
        })


class AdminUsersView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        users = User.objects.select_related('profile').order_by('username')
        payload = []
        for user in users:
            profile = getattr(user, 'profile', None)
            payload.append({
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'is_staff': user.is_staff,
                'is_superuser': user.is_superuser,
                'is_active': user.is_active,
                'role': 'ADMIN' if user.is_staff or user.is_superuser else getattr(profile, 'role', 'USER'),
            })
        return Response(payload)

    def patch(self, request):
        user_id = request.data.get('user_id')
        if not user_id:
            return Response({'detail': 'user_id is required.'}, status=400)

        user = User.objects.filter(id=user_id).first()
        if not user:
            return Response({'detail': 'User not found.'}, status=404)

        role = request.data.get('role')
        username = request.data.get('username')
        email = request.data.get('email')
        is_active = request.data.get('is_active')
        password = request.data.get('password')

        if username is not None:
            username = username.strip()
            if not username:
                return Response({'detail': 'username cannot be empty.'}, status=400)
            if User.objects.exclude(id=user.id).filter(username=username).exists():
                return Response({'detail': 'Username already exists.'}, status=400)
            user.username = username

        if email is not None:
            user.email = str(email).strip()

        if is_active is not None:
            user.is_active = str(is_active).lower() in {'true', '1', 'yes', 'on'}

        if password is not None and str(password).strip():
            user.set_password(str(password).strip())

        user.save()

        if role is not None:
            if user.is_superuser or user.is_staff:
                return Response({'detail': 'System admins keep the ADMIN role.'}, status=400)
            if role not in {'USER', 'LOWER', 'MIDDLE', 'HIGHER'}:
                return Response({'detail': 'Invalid role.'}, status=400)
            profile = getattr(user, 'profile', None)
            if profile is None:
                profile = UserProfile.objects.create(user=user)
            profile.role = role
            profile.save()

        return Response({'detail': 'User updated.'})

    def post(self, request):
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '')
        email = request.data.get('email', '').strip()
        role = request.data.get('role', 'USER')

        if not username or not password:
            return Response({'detail': 'username and password are required.'}, status=400)

        if User.objects.filter(username=username).exists():
            return Response({'detail': 'Username already exists.'}, status=400)

        if role not in {'USER', 'LOWER', 'MIDDLE', 'HIGHER'}:
            role = 'USER'

        user = User.objects.create_user(username=username, email=email, password=password)
        profile = getattr(user, 'profile', None)
        if profile is None:
            profile = UserProfile.objects.create(user=user)
        profile.role = role
        profile.save()

        return Response({'detail': 'User created.', 'id': user.id, 'username': user.username}, status=201)


class AdminLogsView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        logs = ApprovalAction.objects.select_related('request', 'acted_by').order_by('-created_at')[:100]
        payload = []
        for log in logs:
            payload.append({
                'id': log.id,
                'request_id': log.request.request_id,
                'document_name': log.request.document_name,
                'action': log.action,
                'comments': log.comments,
                'acted_by': log.acted_by.username if log.acted_by else 'system',
                'created_at': log.created_at,
            })
        return Response(payload)
