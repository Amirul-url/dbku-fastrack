from rest_framework.routers import DefaultRouter

from .views import NotificationDeliveryViewSet

router = DefaultRouter()
router.register(r"", NotificationDeliveryViewSet, basename="notifications")

urlpatterns = router.urls
