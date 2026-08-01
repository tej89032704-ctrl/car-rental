package com.carrental.service;

import com.carrental.dto.NotificationResponse;
import com.carrental.model.Customer;
import com.carrental.model.Notification;
import com.carrental.model.Owner;
import com.carrental.repository.NotificationRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class NotificationServiceTest {

    @Mock
    private NotificationRepository notificationRepository;

    @InjectMocks
    private NotificationService notificationService;

    private Owner owner(Long id) {
        Owner o = new Owner();
        o.setId(id);
        o.setName("Ravi");
        o.setEmail("ravi@owner.com");
        return o;
    }

    private Notification notif(Long id, String type, boolean read, Owner o) {
        Notification n = new Notification();
        n.setId(id);
        n.setOwner(o);
        n.setType(type);
        n.setTitle(type.equals("car_approved") ? "Car approved 🎉" : "Car not approved");
        n.setMessage("Your Maruti Swift is now live.");
        n.setCarId(7L);
        n.setRead(read);
        n.setCreatedAt(LocalDateTime.of(2026, 8, 1, 10, 0));
        return n;
    }

    @Test
    void create_persistsNotificationWithDefaults() {
        Owner o = owner(1L);
        when(notificationRepository.save(any(Notification.class))).thenAnswer(inv -> inv.getArgument(0));

        NotificationResponse resp = notificationService.create(o, "car_approved", "Car approved 🎉",
                "Your Maruti Swift is now live.", 7L);

        assertEquals("car_approved", resp.getType());
        assertEquals("Car approved 🎉", resp.getTitle());
        assertEquals(7L, resp.getCarId());
        assertNull(resp.getTripId());
        assertFalse(resp.isRead());
        assertNotNull(resp.getCreatedAt());
        verify(notificationRepository).save(any(Notification.class));
    }

    @Test
    void createWithTripId_setsTripReference() {
        Owner o = owner(1L);
        when(notificationRepository.save(any(Notification.class))).thenAnswer(inv -> inv.getArgument(0));

        NotificationResponse resp = notificationService.create(o, "new_booking", "New booking 🚗",
                "Amit booked your Maruti Swift.", 7L, 100L);

        assertEquals("new_booking", resp.getType());
        assertEquals(7L, resp.getCarId());
        assertEquals(100L, resp.getTripId());
        assertFalse(resp.isRead());
        assertNotNull(resp.getCreatedAt());
    }

    @Test
    void list_returnsOwnerNotificationsNewestFirst() {
        Owner o = owner(1L);
        Notification older = notif(1L, "car_rejected", true, o);
        Notification newer = notif(2L, "car_approved", false, o);
        when(notificationRepository.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(newer, older));

        List<NotificationResponse> resp = notificationService.list(o);

        assertEquals(2, resp.size());
        assertEquals(2L, resp.get(0).getId());
        assertEquals("car_approved", resp.get(0).getType());
    }

    @Test
    void unreadCount_delegatesToRepository() {
        when(notificationRepository.countByOwnerIdAndIsReadFalse(1L)).thenReturn(3L);

        long count = notificationService.unreadCount(owner(1L));

        assertEquals(3L, count);
    }

    @Test
    void markRead_marksOnlyOwnersNotification() {
        Owner o = owner(1L);
        Notification n = notif(5L, "car_approved", false, o);
        when(notificationRepository.findById(5L)).thenReturn(Optional.of(n));
        when(notificationRepository.save(any(Notification.class))).thenAnswer(inv -> inv.getArgument(0));

        NotificationResponse resp = notificationService.markRead(o, 5L);

        assertTrue(resp.isRead());
        assertTrue(n.isRead());
    }

    @Test
    void markRead_throwsWhenNotificationBelongsToAnotherOwner() {
        Owner o = owner(1L);
        Owner other = owner(2L);
        Notification n = notif(5L, "car_approved", false, other);
        when(notificationRepository.findById(5L)).thenReturn(Optional.of(n));

        assertThrows(RuntimeException.class, () -> notificationService.markRead(o, 5L));
        assertFalse(n.isRead());
        verify(notificationRepository, never()).save(any(Notification.class));
    }

    @Test
    void markRead_throwsWhenNotFound() {
        when(notificationRepository.findById(99L)).thenReturn(Optional.empty());
        assertThrows(RuntimeException.class, () -> notificationService.markRead(owner(1L), 99L));
    }

    @Test
    void markAllRead_marksEveryOwnerNotification() {
        Owner o = owner(1L);
        Notification n1 = notif(1L, "car_approved", false, o);
        Notification n2 = notif(2L, "car_rejected", false, o);
        when(notificationRepository.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(n1, n2));
        when(notificationRepository.save(any(Notification.class))).thenAnswer(inv -> inv.getArgument(0));

        notificationService.markAllRead(o);

        assertTrue(n1.isRead());
        assertTrue(n2.isRead());
    }

    /* ================= customer notifications ================= */

    private Customer customer(Long id) {
        Customer c = new Customer();
        c.setId(id);
        c.setName("Amit");
        c.setEmail("amit@mail.com");
        return c;
    }

    private Notification customerNotif(Long id, String type, boolean read, Customer c) {
        Notification n = new Notification();
        n.setId(id);
        n.setCustomer(c);
        n.setType(type);
        n.setTitle("Booking confirmed 🎉");
        n.setMessage("Your Honda City booking is confirmed.");
        n.setCarId(7L);
        n.setTripId(100L);
        n.setRead(read);
        n.setCreatedAt(LocalDateTime.of(2026, 8, 1, 11, 0));
        return n;
    }

    @Test
    void createForCustomer_persistsNotificationWithTripId() {
        Customer c = customer(1L);
        when(notificationRepository.save(any(Notification.class))).thenAnswer(inv -> inv.getArgument(0));

        NotificationResponse resp = notificationService.create(c, "booking_confirmed", "Booking confirmed 🎉",
                "Your Honda City booking is confirmed.", 7L, 100L);

        assertEquals("booking_confirmed", resp.getType());
        assertEquals(7L, resp.getCarId());
        assertEquals(100L, resp.getTripId());
        assertFalse(resp.isRead());
        assertNotNull(resp.getCreatedAt());
    }

    @Test
    void listForCustomer_returnsNewestFirst() {
        Customer c = customer(1L);
        Notification older = customerNotif(1L, "booking_cancelled", true, c);
        Notification newer = customerNotif(2L, "trip_completed", false, c);
        when(notificationRepository.findByCustomerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(newer, older));

        List<NotificationResponse> resp = notificationService.list(c);

        assertEquals(2, resp.size());
        assertEquals(2L, resp.get(0).getId());
        assertEquals(100L, resp.get(0).getTripId());
    }

    @Test
    void unreadCountForCustomer_delegatesToRepository() {
        when(notificationRepository.countByCustomerIdAndIsReadFalse(1L)).thenReturn(2L);
        assertEquals(2L, notificationService.unreadCount(customer(1L)));
    }

    @Test
    void markReadForCustomer_marksOnlyOwnersNotification() {
        Customer c = customer(1L);
        Notification n = customerNotif(5L, "booking_confirmed", false, c);
        when(notificationRepository.findById(5L)).thenReturn(Optional.of(n));
        when(notificationRepository.save(any(Notification.class))).thenAnswer(inv -> inv.getArgument(0));

        NotificationResponse resp = notificationService.markRead(c, 5L);

        assertTrue(resp.isRead());
        assertTrue(n.isRead());
    }

    @Test
    void markReadForCustomer_throwsWhenBelongsToAnotherCustomer() {
        Customer c = customer(1L);
        Customer other = customer(2L);
        Notification n = customerNotif(5L, "booking_confirmed", false, other);
        when(notificationRepository.findById(5L)).thenReturn(Optional.of(n));

        assertThrows(RuntimeException.class, () -> notificationService.markRead(c, 5L));
        assertFalse(n.isRead());
        verify(notificationRepository, never()).save(any(Notification.class));
    }

    @Test
    void markAllReadForCustomer_marksEveryNotification() {
        Customer c = customer(1L);
        Notification n1 = customerNotif(1L, "booking_confirmed", false, c);
        Notification n2 = customerNotif(2L, "trip_completed", false, c);
        when(notificationRepository.findByCustomerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(n1, n2));
        when(notificationRepository.save(any(Notification.class))).thenAnswer(inv -> inv.getArgument(0));

        notificationService.markAllRead(c);

        assertTrue(n1.isRead());
        assertTrue(n2.isRead());
    }
}
