package com.carrental.service;

import com.carrental.config.JwtUtil;
import com.carrental.dto.*;
import com.carrental.model.Customer;
import com.carrental.model.Owner;
import com.carrental.repository.CustomerRepository;
import com.carrental.repository.OwnerRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {
    private final OwnerRepository ownerRepository;
    private final CustomerRepository customerRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    public AuthService(OwnerRepository ownerRepository, CustomerRepository customerRepository,
                       PasswordEncoder passwordEncoder, JwtUtil jwtUtil) {
        this.ownerRepository = ownerRepository;
        this.customerRepository = customerRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
    }

    public AuthResponse register(RegisterRequest req) {
        String role = req.getRole() != null ? req.getRole() : "customer";
        String section = "customer".equals(role) ? "Pick a car" : "Give a car";

        if ("customer".equals(role)) {
            if (customerRepository.existsByEmail(req.getEmail())) {
                throw new RuntimeException("This email is already registered in " + section);
            }
            Customer c = new Customer();
            c.setName(req.getName());
            c.setEmail(req.getEmail());
            c.setPassword(passwordEncoder.encode(req.getPassword()));
            c = customerRepository.save(c);
            String token = jwtUtil.generateToken(c.getEmail(), c.getId(), "customer");
            return new AuthResponse(token, c.getName(), c.getEmail(), "customer", c.getId());
        } else {
            if (ownerRepository.existsByEmail(req.getEmail())) {
                throw new RuntimeException("This email is already registered in " + section);
            }
            Owner o = new Owner();
            o.setName(req.getName());
            o.setEmail(req.getEmail());
            o.setPassword(passwordEncoder.encode(req.getPassword()));
            o = ownerRepository.save(o);
            String token = jwtUtil.generateToken(o.getEmail(), o.getId(), "owner");
            return new AuthResponse(token, o.getName(), o.getEmail(), "owner", o.getId());
        }
    }

    public AuthResponse login(LoginRequest req) {
        String role = req.getRole() != null ? req.getRole() : "customer";
        String section = "customer".equals(role) ? "Pick a car" : "Give a car";

        if ("customer".equals(role)) {
            Customer c = customerRepository.findByEmail(req.getEmail())
                    .orElseThrow(() -> new RuntimeException("No account found for " + section + " with this email"));
            if (!passwordEncoder.matches(req.getPassword(), c.getPassword())) {
                throw new RuntimeException("Incorrect password");
            }
            String token = jwtUtil.generateToken(c.getEmail(), c.getId(), "customer");
            return new AuthResponse(token, c.getName(), c.getEmail(), "customer", c.getId());
        } else {
            Owner o = ownerRepository.findByEmail(req.getEmail())
                    .orElseThrow(() -> new RuntimeException("No account found for " + section + " with this email"));
            if (!passwordEncoder.matches(req.getPassword(), o.getPassword())) {
                throw new RuntimeException("Incorrect password");
            }
            String token = jwtUtil.generateToken(o.getEmail(), o.getId(), "owner");
            return new AuthResponse(token, o.getName(), o.getEmail(), "owner", o.getId());
        }
    }
}
