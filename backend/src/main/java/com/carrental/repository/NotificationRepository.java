package com.carrental.repository;

import com.carrental.model.Notification;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface NotificationRepository extends JpaRepository<Notification, Long> {
    List<Notification> findByOwnerIdOrderByCreatedAtDesc(Long ownerId);
    long countByOwnerIdAndIsReadFalse(Long ownerId);
    List<Notification> findByCustomerIdOrderByCreatedAtDesc(Long customerId);
    long countByCustomerIdAndIsReadFalse(Long customerId);
}
