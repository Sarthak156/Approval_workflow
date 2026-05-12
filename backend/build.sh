#!/usr/bin/env bash

pip install -r requirements.txt
python manage.py migrate

python manage.py shell -c "
from django.contrib.auth import get_user_model;
User = get_user_model();

if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser(
        'Admin',
        'goyalsarthak156@gmail.com',
        'admin123'
    )
"
