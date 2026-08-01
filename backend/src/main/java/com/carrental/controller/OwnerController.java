package com.carrental.controller;

import com.carrental.dto.*;
import com.carrental.model.Owner;
import com.carrental.service.OwnerService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/owner")
public class OwnerController {

    private final OwnerService ownerService;

    public OwnerController(OwnerService ownerService) {
        this.ownerService = ownerService;
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

    /* ---------------- TRANSACTIONS / EARNINGS ---------------- */

    @GetMapping("/transactions")
    public ResponseEntity<?> transactions() {
        try {
            return ok(ownerService.listTransactions(currentOwner()));
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
}
