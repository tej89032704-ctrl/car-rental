package com.carrental.controller;

import com.carrental.dto.*;
import com.carrental.model.Admin;
import com.carrental.service.AdminService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminService adminService;

    public AdminController(AdminService adminService) {
        this.adminService = adminService;
    }

    private Admin currentAdmin() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getName() == null || "anonymousUser".equals(auth.getName())) {
            throw new RuntimeException("Not authenticated");
        }
        return adminService.findByEmail(auth.getName());
    }

    private ResponseEntity<?> ok(Object body) {
        return ResponseEntity.ok(body);
    }

    private ResponseEntity<?> err(Exception e) {
        return ResponseEntity.badRequest().body(new ErrorResponse(e.getMessage() == null ? "Something went wrong." : e.getMessage()));
    }

    /* ---------------- AUTH ---------------- */

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest req) {
        try {
            return ok(adminService.login(req));
        } catch (Exception e) {
            return err(e);
        }
    }

    /* ---------------- DOCUMENTS ---------------- */

    @GetMapping("/documents")
    public ResponseEntity<?> listDocuments(@RequestParam(required = false) String status) {
        try {
            currentAdmin();
            return ok(adminService.listDocuments(status));
        } catch (Exception e) {
            return err(e);
        }
    }

    @PutMapping("/documents/{docId}/approve")
    public ResponseEntity<?> approve(@PathVariable Long docId) {
        try {
            currentAdmin();
            return ok(adminService.approveDocument(docId));
        } catch (Exception e) {
            return err(e);
        }
    }

    @PutMapping("/documents/{docId}/reject")
    public ResponseEntity<?> reject(@PathVariable Long docId, @RequestBody(required = false) Map<String, String> body) {
        try {
            currentAdmin();
            String reason = body == null ? null : body.get("reason");
            return ok(adminService.rejectDocument(docId, reason));
        } catch (Exception e) {
            return err(e);
        }
    }

    /* ---------------- CARS ---------------- */

    @GetMapping("/cars")
    public ResponseEntity<?> cars(@RequestParam(required = false) String status) {
        try {
            currentAdmin();
            return ok(adminService.listCars(status));
        } catch (Exception e) {
            return err(e);
        }
    }

    @PutMapping("/cars/{carId}/approve")
    public ResponseEntity<?> approveCar(@PathVariable Long carId) {
        try {
            currentAdmin();
            return ok(adminService.approveCar(carId));
        } catch (Exception e) {
            return err(e);
        }
    }

    @PutMapping("/cars/{carId}/reject")
    public ResponseEntity<?> rejectCar(@PathVariable Long carId, @RequestBody(required = false) Map<String, String> body) {
        try {
            currentAdmin();
            String reason = body == null ? null : body.get("reason");
            return ok(adminService.rejectCar(carId, reason));
        } catch (Exception e) {
            return err(e);
        }
    }

    /* ---------------- USERS & STATS ---------------- */

    @GetMapping("/users")
    public ResponseEntity<?> users() {
        try {
            currentAdmin();
            return ok(adminService.listUsers());
        } catch (Exception e) {
            return err(e);
        }
    }

    @GetMapping("/stats")
    public ResponseEntity<?> stats() {
        try {
            currentAdmin();
            return ok(adminService.stats());
        } catch (Exception e) {
            return err(e);
        }
    }
}
