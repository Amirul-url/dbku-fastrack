from django.contrib import admin
from django.urls import path, include, re_path
from django.http import JsonResponse
from django.views.static import serve

from django.conf import settings
from django.conf.urls.static import static


def home(request):
    return JsonResponse({
        "message": "fasTrack backend running"
    })


urlpatterns = [
    path("", home),
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/applications/", include("applications.urls")),
]

if settings.DEBUG:
    urlpatterns += static(
        settings.MEDIA_URL,
        document_root=settings.MEDIA_ROOT,
    )
else:
    urlpatterns += [
        re_path(
            r"^media/(?P<path>.*)$",
            serve,
            {"document_root": settings.MEDIA_ROOT},
        ),
    ]
