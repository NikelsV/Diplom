"""
URL configuration for webmap project.
"""
import os
from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse, HttpResponseNotFound
from django.urls import path, include, re_path
from django.conf import settings
from django.views.static import serve


# Имя переменной окружения, которая включает режим X-Accel-Redirect:
# когда установлена в "true", Django не отдаёт медиа сам, а делегирует
# отдачу файла nginx-у через заголовок X-Accel-Redirect.
# В режиме разработки и при запуске без nginx переменная не задана,
# и Django отдаёт файлы сам через django.views.static.serve.
USE_XACCEL = os.environ.get('USE_XACCEL_REDIRECT', '').lower() in ('true', '1', 'yes')


@login_required
def serve_media_protected(request, path):
    """
    Защищённая раздача медиа-файлов.

    В режиме разработки (USE_XACCEL=false) отдаёт файл сам через django.views.static.serve.

    В продакшене с nginx (USE_XACCEL=true) возвращает пустой ответ с заголовком
    X-Accel-Redirect, который nginx перехватывает и отдаёт файл сам с диска.
    Это сочетает скорость отдачи nginx с проверкой прав на стороне Django.

    Принципиально: ни в одном из режимов Django не отдаёт медиа анонимным
    пользователям — декоратор login_required перенаправит на страницу входа.
    """
    if USE_XACCEL:
        # Внутренний путь, который nginx использует только для X-Accel-Redirect.
        # В nginx.conf для этого пути стоит "internal;" — снаружи он недоступен,
        # обращение возможно только через перенаправление от приложения.
        response = HttpResponse()
        response['X-Accel-Redirect'] = f'/internal-media/{path}'
        # Content-Type сбрасываем — nginx определит его сам по расширению файла.
        del response['Content-Type']
        return response
    # Локальный режим: отдаём файл сам.
    return serve(request, path, document_root=settings.MEDIA_ROOT)


def healthcheck(request):
    """
    Простой эндпоинт проверки живости приложения.
    Используется healthcheck'ами в compose.yaml и системами мониторинга снаружи.
    Аутентификация не требуется — это нужно, чтобы проверять живость даже без логина.
    """
    return HttpResponse('OK', content_type='text/plain')


urlpatterns = [
    # Healthcheck (без аутентификации)
    path('health/', healthcheck, name='health'),

    path('admin/', admin.site.urls),

    # Встроенные view Django для аутентификации.
    # LoginView ищет шаблон по пути registration/login.html — мы предоставляем его.
    # LogoutView требует POST (защита от выхода через перебор ссылок); это поведение
    # включено по умолчанию начиная с Django 5.0.
    path(
        'accounts/login/',
        auth_views.LoginView.as_view(template_name='registration/login.html'),
        name='login',
    ),
    path('accounts/logout/', auth_views.LogoutView.as_view(), name='logout'),

    path('', include('mappy.urls')),
    path('api/monitoring/', include('monitoring.urls')),

    # Защищённая раздача медиа-файлов.
    # В продакшене с nginx сам файл отдаёт nginx (через X-Accel-Redirect),
    # а Django только проверяет права доступа.
    re_path(r'^media/(?P<path>.*)$', serve_media_protected),
]
