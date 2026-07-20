package com.carrental.service;

import com.carrental.config.JwtUtil;
import com.carrental.dto.*;
import com.carrental.model.User;
import com.carrental.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtUtil jwtUtil) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
    }

    public AuthResponse register(RegisterRequest req) {
        String role = req.getRole() != null ? req.getRole() : "customer";
        String section = "customer".equals(role) ? "Pick a car" : "Give a car";

        if (userRepository.existsByEmailAndRole(req.getEmail(), role)) {
            throw new RuntimeException("This email is already registered in " + section);
        }

        User user = new User();
        user.setName(req.getName());
        user.setEmail(req.getEmail());
        user.setPassword(passwordEncoder.encode(req.getPassword()));
        user.setRole(role);
        user = userRepository.save(user);
        String token = jwtUtil.generateToken(user.getEmail(), user.getId(), user.getRole());
        return new AuthResponse(token, user.getName(), user.getEmail(), user.getRole(), user.getId());
    }

    public AuthResponse login(LoginRequest req) {
        String role = req.getRole() != null ? req.getRole() : "customer";
        String section = "customer".equals(role) ? "Pick a car" : "Give a car";

        User user = userRepository.findByEmailAndRole(req.getEmail(), role)
                .orElseThrow(() -> new RuntimeException("No account found for " + section + " with this email"));

        if (!passwordEncoder.matches(req.getPassword(), user.getPassword())) {
            throw new RuntimeException("Incorrect password");
        }
        String token = jwtUtil.generateToken(user.getEmail(), user.getId(), user.getRole());
        return new AuthResponse(token, user.getName(), user.getEmail(), user.getRole(), user.getId());
    }
}
