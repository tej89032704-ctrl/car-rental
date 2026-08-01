package com.carrental.service;

import com.carrental.dto.NotificationResponse;
import com.carrental.model.Customer;
import com.carrental.model.Notification;
import com.carrental.model.Owner;
import com.carrental.repository.NotificationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class NotificationService {

    private final NotificationRepository notificationRepository;

    public NotificationService(NotificationRepository notificationRepository) {
        this.notificationRepository = notificationRepository;
    }

    /* ---------- owner notifications ---------- */

    @Transactional
    public NotificationResponse create(Owner owner, String type, String title, String message, Long carId) {
        return create(owner, type, title, message, carId, null);
    }

    @Transactional
    public NotificationResponse create(Owner owner, String type, String title, String message, Long carId, Long tripId) {
        Notification n = new Notification();
        n.setOwner(owner);
        n.setType(type);
        n.setTitle(title);
        n.setMessage(message);
        n.setCarId(carId);
        n.setTripId(tripId);
        n.setRead(false);
        n.setCreatedAt(LocalDateTime.now());
        notificationRepository.save(n);
        return toResponse(n);
    }

    public List<NotificationResponse> list(Owner owner) {
        return notificationRepository.findByOwnerIdOrderByCreatedAtDesc(owner.getId()).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    public long unreadCount(Owner owner) {
        return notificationRepository.countByOwnerIdAndIsReadFalse(owner.getId());
    }

    @Transactional
    public NotificationResponse markRead(Owner owner, Long notifId) {
        Notification n = findOwned(owner.getId(), notifId);
        n.setRead(true);
        notificationRepository.save(n);
        return toResponse(n);
    }

    @Transactional
    public void markAllRead(Owner owner) {
        notificationRepository.findByOwnerIdOrderByCreatedAtDesc(owner.getId())
                .forEach(n -> {
                    n.setRead(true);
                    notificationRepository.save(n);
                });
    }

    private Notification findOwned(Long ownerId, Long notifId) {
        Notification n = notificationRepository.findById(notifId)
                .orElseThrow(() -> new RuntimeException("Notification not found"));
        if (n.getOwner() == null || !n.getOwner().getId().equals(ownerId)) {
            throw new RuntimeException("Notification not found");
        }
        return n;
    }

    /* ---------- customer notifications ---------- */

    @Transactional
    public NotificationResponse create(Customer customer, String type, String title, String message, Long carId) {
        return create(customer, type, title, message, carId, null);
    }

    @Transactional
    public NotificationResponse create(Customer customer, String type, String title, String message, Long carId, Long tripId) {
        Notification n = new Notification();
        n.setCustomer(customer);
        n.setType(type);
        n.setTitle(title);
        n.setMessage(message);
        n.setCarId(carId);
        n.setTripId(tripId);
        n.setRead(false);
        n.setCreatedAt(LocalDateTime.now());
        notificationRepository.save(n);
        return toResponse(n);
    }

    public List<NotificationResponse> list(Customer customer) {
        return notificationRepository.findByCustomerIdOrderByCreatedAtDesc(customer.getId()).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    public long unreadCount(Customer customer) {
        return notificationRepository.countByCustomerIdAndIsReadFalse(customer.getId());
    }

    @Transactional
    public NotificationResponse markRead(Customer customer, Long notifId) {
        Notification n = findCustomerOwned(customer.getId(), notifId);
        n.setRead(true);
        notificationRepository.save(n);
        return toResponse(n);
    }

    @Transactional
    public void markAllRead(Customer customer) {
        notificationRepository.findByCustomerIdOrderByCreatedAtDesc(customer.getId())
                .forEach(n -> {
                    n.setRead(true);
                    notificationRepository.save(n);
                });
    }

    private Notification findCustomerOwned(Long customerId, Long notifId) {
        Notification n = notificationRepository.findById(notifId)
                .orElseThrow(() -> new RuntimeException("Notification not found"));
        if (n.getCustomer() == null || !n.getCustomer().getId().equals(customerId)) {
            throw new RuntimeException("Notification not found");
        }
        return n;
    }

    private NotificationResponse toResponse(Notification n) {
        return new NotificationResponse(n.getId(), n.getType(), n.getTitle(), n.getMessage(),
                n.getCarId(), n.getTripId(), n.isRead(),
                n.getCreatedAt() == null ? null : n.getCreatedAt().toString());
    }
}
