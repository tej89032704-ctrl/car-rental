package com.carrental.service;

import com.carrental.config.JwtUtil;
import com.carrental.dto.AuthResponse;
import com.carrental.dto.LoginRequest;
import com.carrental.model.Admin;
import com.carrental.repository.AdminRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AgentService {

    private final AdminRepository adminRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    public AgentService(AdminRepository adminRepository, PasswordEncoder passwordEncoder, JwtUtil jwtUtil) {
        this.adminRepository = adminRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
    }

    /** Agent login — only accounts with role "agent" may use this endpoint. */
    public AuthResponse login(LoginRequest req) {
        if (req.getEmail() == null || req.getEmail().isBlank()) {
            throw new RuntimeException("Email is required");
        }
        if (req.getPassword() == null || req.getPassword().isBlank()) {
            throw new RuntimeException("Password is required");
        }
        Admin admin = adminRepository.findByEmail(req.getEmail().trim())
                .orElseThrow(() -> new RuntimeException("Invalid agent credentials"));
        if (!passwordEncoder.matches(req.getPassword(), admin.getPassword())) {
            throw new RuntimeException("Invalid agent credentials");
        }
        if (!"agent".equals(admin.getRole())) {
            throw new RuntimeException("This account is not an agent — use the admin login instead");
        }
        String token = jwtUtil.generateToken(admin.getEmail(), admin.getId(), "agent");
        return new AuthResponse(token, admin.getName(), admin.getEmail(), "agent", admin.getId());
    }
}
