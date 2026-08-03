package com.carrental.controller;

import com.carrental.dto.ErrorResponse;
import com.carrental.dto.LoginRequest;
import com.carrental.model.Admin;
import com.carrental.service.AdminService;
import com.carrental.service.AgentService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/agent")
public class AgentController {

    private final AgentService agentService;
    private final AdminService adminService;

    public AgentController(AgentService agentService, AdminService adminService) {
        this.agentService = agentService;
        this.adminService = adminService;
    }

    private Admin currentAgent() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getName() == null || "anonymousUser".equals(auth.getName())) {
            throw new RuntimeException("Not authenticated");
        }
        Admin a = adminService.findByEmail(auth.getName());
        if (!"agent".equals(a.getRole())) {
            throw new RuntimeException("Agent access only");
        }
        return a;
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
            return ok(agentService.login(req));
        } catch (Exception e) {
            return err(e);
        }
    }

    /* ---------------- DOCUMENTS ---------------- */

    @GetMapping("/documents")
    public ResponseEntity<?> listDocuments(@RequestParam(required = false) String status) {
        try {
            currentAgent();
            return ok(adminService.listDocuments(status));
        } catch (Exception e) {
            return err(e);
        }
    }

    @PutMapping("/documents/{docId}/approve")
    public ResponseEntity<?> approve(@PathVariable Long docId) {
        try {
            currentAgent();
            return ok(adminService.approveDocument(docId));
        } catch (Exception e) {
            return err(e);
        }
    }

    @PutMapping("/documents/{docId}/reject")
    public ResponseEntity<?> reject(@PathVariable Long docId, @RequestBody(required = false) Map<String, String> body) {
        try {
            currentAgent();
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
            currentAgent();
            return ok(adminService.listCars(status));
        } catch (Exception e) {
            return err(e);
        }
    }

    @PutMapping("/cars/{carId}/approve")
    public ResponseEntity<?> approveCar(@PathVariable Long carId) {
        try {
            currentAgent();
            return ok(adminService.approveCar(carId));
        } catch (Exception e) {
            return err(e);
        }
    }

    @PutMapping("/cars/{carId}/reject")
    public ResponseEntity<?> rejectCar(@PathVariable Long carId, @RequestBody(required = false) Map<String, String> body) {
        try {
            currentAgent();
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
            currentAgent();
            return ok(adminService.listUsers());
        } catch (Exception e) {
            return err(e);
        }
    }

    @GetMapping("/stats")
    public ResponseEntity<?> stats() {
        try {
            currentAgent();
            return ok(adminService.stats());
        } catch (Exception e) {
            return err(e);
        }
    }
}
