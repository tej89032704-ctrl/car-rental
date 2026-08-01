package com.carrental.controller;

import com.carrental.dto.*;
import com.carrental.model.Owner;
import com.carrental.service.NotificationService;
import com.carrental.service.OwnerService;
import com.carrental.service.ReviewService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/owner")
public class OwnerController {

    private final OwnerService ownerService;
    private final NotificationService notificationService;
    private final ReviewService reviewService;

    public OwnerController(OwnerService ownerService, NotificationService notificationService,
                           ReviewService reviewService) {
        this.ownerService = ownerService;
        this.notificationService = notificationService;
        this.reviewService = reviewService;
    }

    private Owner currentOwner() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getName() == null || "anonymousUser".equals(auth.getName())) {
            throw new RuntimeException("Not authenticated");
        }
        return ownerService.findByEmail(auth.getName());
    }

    private ResponseEntity<?> ok(Object body) {
        return ResponseEntity.ok(body);
    }

    private ResponseEntity<?> err(Exception e) {
        return ResponseEntity.badRequest().body(new ErrorResponse(e.getMessage() == null ? "Something went wrong." : e.getMessage()));
    }

    /* ---------------- PROFILE ---------------- */

    @GetMapping("/profile")
    public ResponseEntity<?> profile() {
        try {
            return ok(ownerService.getProfile(currentOwner()));
        } catch (Exception e) {
            return err(e);
        }
    }

    @PutMapping("/profile")
    public ResponseEntity<?> updateProfile(@RequestBody UpdateProfileRequest req) {
        try {
            return ok(ownerService.updateProfile(currentOwner(), req));
        } catch (Exception e) {
            return err(e);
        }
    }

    /* ---------------- MY CARS ---------------- */

    @GetMapping("/cars")
    public ResponseEntity<?> myCars() {
        try {
            return ok(ownerService.listMyCars(currentOwner()));
        } catch (Exception e) {
            return err(e);
        }
    }

    @PostMapping("/cars")
    public ResponseEntity<?> addCar(@RequestBody CarCreateRequest req) {
        try {
            return ok(ownerService.addCar(currentOwner(), req));
        } catch (Exception e) {
            return err(e);
        }
    }

    @PutMapping("/cars/{carId}")
    public ResponseEntity<?> updateCar(@PathVariable Long carId, @RequestBody CarCreateRequest req) {
        try {
            return ok(ownerService.updateCar(currentOwner(), carId, req));
        } catch (Exception e) {
            return err(e);
        }
    }

    @DeleteMapping("/cars/{carId}")
    public ResponseEntity<?> deleteCar(@PathVariable Long carId) {
        try {
            ownerService.deleteCar(currentOwner(), carId);
            return ok(Map.of("message", "Car deleted"));
        } catch (Exception e) {
            return err(e);
        }
    }

    /* ---------------- TRIPS / BOOKINGS ---------------- */

    @GetMapping("/trips")
    public ResponseEntity<?> listTrips(@RequestParam(required = false) String status) {
        try {
            return ok(ownerService.listTrips(currentOwner(), status));
        } catch (Exception e) {
            return err(e);
        }
    }

    @PutMapping("/trips/{tripId}/status")
    public ResponseEntity<?> updateTripStatus(@PathVariable Long tripId, @RequestBody TripStatusRequest req) {
        try {
            return ok(ownerService.updateTripStatus(currentOwner(), tripId, req.getStatus()));
        } catch (Exception e) {
            return err(e);
        }
    }

    @PostMapping("/trips/{tripId}/review")
    public ResponseEntity<?> reviewTrip(@PathVariable Long tripId, @RequestBody ReviewRequest req) {
        try {
            return ok(reviewService.submitOwnerReview(currentOwner(), tripId, req));
        } catch (Exception e) {
            return err(e);
        }
    }

    @GetMapping("/reviews")
    public ResponseEntity<?> myReviews() {
        try {
            return ok(reviewService.receivedByOwner(currentOwner().getId()));
        } catch (Exception e) {
            return err(e);
        }
    }

    /* ---------------- TRANSACTIONS / EARNINGS ---------------- */

    @GetMapping("/transactions")
    public ResponseEntity<?> transactions() {
        try {
            return ok(ownerService.listTransactions(currentOwner()));
        } catch (Exception e) {
            return err(e);
        }
    }

    @GetMapping("/earnings")
    public ResponseEntity<?> earningsSummary() {
        try {
            return ok(ownerService.getEarningsSummary(currentOwner()));
        } catch (Exception e) {
            return err(e);
        }
    }

    /* ---------------- DOCUMENTS ---------------- */

    @GetMapping("/documents")
    public ResponseEntity<?> listDocuments() {
        try {
            return ok(ownerService.listDocuments(currentOwner()));
        } catch (Exception e) {
            return err(e);
        }
    }

    @PostMapping("/documents")
    public ResponseEntity<?> addDocument(@RequestBody DocumentRequest req) {
        try {
            return ok(ownerService.addDocument(currentOwner(), req));
        } catch (Exception e) {
            return err(e);
        }
    }

    @DeleteMapping("/documents/{docId}")
    public ResponseEntity<?> deleteDocument(@PathVariable Long docId) {
        try {
            ownerService.deleteDocument(currentOwner(), docId);
            return ok(Map.of("message", "Document deleted"));
        } catch (Exception e) {
            return err(e);
        }
    }

    /* ---------------- NOTIFICATIONS ---------------- */

    @GetMapping("/notifications")
    public ResponseEntity<?> notifications() {
        try {
            return ok(notificationService.list(currentOwner()));
        } catch (Exception e) {
            return err(e);
        }
    }

    @GetMapping("/notifications/unread-count")
    public ResponseEntity<?> unreadCount() {
        try {
            return ok(Map.of("count", notificationService.unreadCount(currentOwner())));
        } catch (Exception e) {
            return err(e);
        }
    }

    @PutMapping("/notifications/{notifId}/read")
    public ResponseEntity<?> markRead(@PathVariable Long notifId) {
        try {
            return ok(notificationService.markRead(currentOwner(), notifId));
        } catch (Exception e) {
            return err(e);
        }
    }

    @PutMapping("/notifications/read-all")
    public ResponseEntity<?> markAllRead() {
        try {
            notificationService.markAllRead(currentOwner());
            return ok(Map.of("message", "All notifications marked as read"));
        } catch (Exception e) {
            return err(e);
        }
    }
}
