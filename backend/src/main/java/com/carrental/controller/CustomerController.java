package com.carrental.controller;

import com.carrental.dto.*;
import com.carrental.model.Customer;
import com.carrental.service.CustomerService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/customer")
public class CustomerController {

    private final CustomerService customerService;

    public CustomerController(CustomerService customerService) {
        this.customerService = customerService;
    }

    private Customer currentCustomer() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getName() == null || "anonymousUser".equals(auth.getName())) {
            throw new RuntimeException("Not authenticated");
        }
        return customerService.findByEmail(auth.getName());
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
            return ok(customerService.getProfile(currentCustomer()));
        } catch (Exception e) {
            return err(e);
        }
    }

    @PutMapping("/profile")
    public ResponseEntity<?> updateProfile(@RequestBody UpdateProfileRequest req) {
        try {
            return ok(customerService.updateProfile(currentCustomer(), req));
        } catch (Exception e) {
            return err(e);
        }
    }

    /* ---------------- CARS ---------------- */

    @GetMapping("/cars")
    public ResponseEntity<?> listCars(
            @RequestParam(required = false) String city,
            @RequestParam(required = false) String fuelType,
            @RequestParam(required = false) String transmission,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(required = false) String search) {
        try {
            return ok(customerService.listCars(city, fuelType, transmission, minPrice, maxPrice, search));
        } catch (Exception e) {
            return err(e);
        }
    }

    @GetMapping("/cars/{carId}")
    public ResponseEntity<?> carDetail(@PathVariable Long carId) {
        try {
            return ok(customerService.getCarDetail(carId));
        } catch (Exception e) {
            return err(e);
        }
    }

    /* ---------------- TRIPS ---------------- */

    @PostMapping("/trips")
    public ResponseEntity<?> createTrip(@RequestBody TripRequest req) {
        try {
            return ok(customerService.createTrip(currentCustomer(), req));
        } catch (Exception e) {
            return err(e);
        }
    }

    @GetMapping("/trips")
    public ResponseEntity<?> listTrips(@RequestParam(required = false) String status) {
        try {
            return ok(customerService.listTrips(currentCustomer(), status));
        } catch (Exception e) {
            return err(e);
        }
    }

    @GetMapping("/trips/{tripId}")
    public ResponseEntity<?> tripDetail(@PathVariable Long tripId) {
        try {
            return ok(customerService.getTrip(currentCustomer(), tripId));
        } catch (Exception e) {
            return err(e);
        }
    }

    @PutMapping("/trips/{tripId}/cancel")
    public ResponseEntity<?> cancelTrip(@PathVariable Long tripId) {
        try {
            return ok(customerService.cancelTrip(currentCustomer(), tripId));
        } catch (Exception e) {
            return err(e);
        }
    }

    /* ---------------- DOCUMENTS ---------------- */

    @GetMapping("/documents")
    public ResponseEntity<?> listDocuments() {
        try {
            return ok(customerService.listDocuments(currentCustomer()));
        } catch (Exception e) {
            return err(e);
        }
    }

    @PostMapping("/documents")
    public ResponseEntity<?> addDocument(@RequestBody DocumentRequest req) {
        try {
            return ok(customerService.addDocument(currentCustomer(), req));
        } catch (Exception e) {
            return err(e);
        }
    }

    @DeleteMapping("/documents/{docId}")
    public ResponseEntity<?> deleteDocument(@PathVariable Long docId) {
        try {
            customerService.deleteDocument(currentCustomer(), docId);
            return ok(Map.of("message", "Document deleted"));
        } catch (Exception e) {
            return err(e);
        }
    }

    /* ---------------- TRANSACTIONS ---------------- */

    @GetMapping("/transactions")
    public ResponseEntity<?> transactions() {
        try {
            return ok(customerService.listTransactions(currentCustomer()));
        } catch (Exception e) {
            return err(e);
        }
    }
}
