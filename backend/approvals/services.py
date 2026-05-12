from rest_framework.exceptions import PermissionDenied


def required_role_for_status(status):
    if status == 'PENDING_LOWER':
        return 'LOWER'
    if status == 'PENDING_MIDDLE':
        return 'MIDDLE'
    if status == 'PENDING_HIGHER':
        return 'HIGHER'
    return None


def submission_route_for_role(role):
    if role == 'LOWER':
        return 'PENDING_MIDDLE'
    if role == 'MIDDLE':
        return 'PENDING_HIGHER'
    if role == 'HIGHER':
        return 'APPROVED'
    return 'PENDING_LOWER'


def role_rank(role):
    return {
        'USER': 0,
        'LOWER': 1,
        'MIDDLE': 2,
        'HIGHER': 3,
        'ADMIN': 4,
    }.get(role, 0)


def visible_request_roles_for_user(user):
    if getattr(user, 'is_superuser', False) or getattr(user, 'is_staff', False):
        return {'USER', 'LOWER', 'MIDDLE', 'HIGHER', 'ADMIN'}

    role = getattr(getattr(user, 'profile', None), 'role', 'USER')
    if role == 'LOWER':
        return {'USER', 'LOWER'}
    if role == 'MIDDLE':
        return {'USER', 'LOWER', 'MIDDLE'}
    if role == 'HIGHER':
        return {'USER', 'LOWER', 'MIDDLE', 'HIGHER'}
    return {'USER'}


def ensure_can_handle_request(user, approval_request):
    if getattr(user, 'is_superuser', False) or getattr(user, 'is_staff', False):
        return

    user_role = getattr(getattr(user, 'profile', None), 'role', 'USER')
    required_role = required_role_for_status(approval_request.status)
    if required_role is None:
        raise PermissionDenied('This request can no longer be processed.')
    if user_role != required_role:
        raise PermissionDenied('Your role cannot process this request stage.')
