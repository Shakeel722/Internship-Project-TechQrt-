from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import HospitalViewSet

router = DefaultRouter()
router.register('', HospitalViewSet, basename='hospital')

urlpatterns = [
    path('', include(router.urls)),
]
