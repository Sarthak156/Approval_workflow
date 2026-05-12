from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import ApprovalRequestViewSet, MeView, AdminUsersView, AdminLogsView

router = DefaultRouter()
router.register(r'requests', ApprovalRequestViewSet, basename='requests')

urlpatterns = [
    path('', include(router.urls)),
    path('me/', MeView.as_view()),
    path('admin/users/', AdminUsersView.as_view()),
    path('admin/logs/', AdminLogsView.as_view()),
]
