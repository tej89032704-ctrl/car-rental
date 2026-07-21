package com.carrental.service;

import com.carrental.config.JwtUtil;
import com.carrental.dto.*;
import com.carrental.model.Customer;
import com.carrental.model.Owner;
import com.carrental.repository.CustomerRepository;
import com.carrental.repository.OwnerRepository;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.util.Collections;

@Service
public class AuthService {
    private final OwnerRepository ownerRepository;
    private final CustomerRepository customerRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    @Value("${google.client-id:}")
    private String googleClientId;

    private GoogleIdTokenVerifier googleVerifier;

    private static final String GOOGLE_CLIENT_ID = "968585560679-k9f6mnvmd9lkb1s74lbikilotnvb5tgg.apps.googleusercontent.com";

    public AuthService(OwnerRepository ownerRepository, CustomerRepository customerRepository,
                       PasswordEncoder passwordEncoder, JwtUtil jwtUtil) {
        this.ownerRepository = ownerRepository;
        this.customerRepository = customerRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
    }

    @PostConstruct
    public void initGoogleVerifier() {
        String clientId = (googleClientId != null && !googleClientId.isBlank()) ? googleClientId : GOOGLE_CLIENT_ID;
        googleVerifier = new GoogleIdTokenVerifier.Builder(new NetHttpTransport(), GsonFactory.getDefaultInstance())
                .setAudience(Collections.singletonList(clientId))
                .build();
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

    public AuthResponse googleLogin(GoogleLoginRequest req) {
        String role = req.getRole() != null ? req.getRole() : "customer";
        String section = "customer".equals(role) ? "Pick a car" : "Give a car";

        GoogleIdToken idToken;
        try {
            idToken = googleVerifier.verify(req.getCredential());
        } catch (Exception e) {
            throw new RuntimeException("Invalid Google token");
        }

        if (idToken == null) {
            throw new RuntimeException("Invalid Google token");
        }

        GoogleIdToken.Payload payload = idToken.getPayload();
        String email = payload.getEmail();
        String name = (String) payload.get("name");

        boolean existsAsCustomer = customerRepository.existsByEmail(email);
        boolean existsAsOwner = ownerRepository.existsByEmail(email);

        if ("customer".equals(role)) {
            if (existsAsOwner) {
                throw new RuntimeException("This Google account is already registered as an owner. Please sign in as owner.");
            }
            Customer c = customerRepository.findByEmail(email).orElseGet(() -> {
                Customer newC = new Customer();
                newC.setName(name);
                newC.setEmail(email);
                newC.setPassword(passwordEncoder.encode("GOOGLE_AUTH_" + System.currentTimeMillis()));
                return customerRepository.save(newC);
            });
            String token = jwtUtil.generateToken(c.getEmail(), c.getId(), "customer");
            return new AuthResponse(token, c.getName(), c.getEmail(), "customer", c.getId());
        } else {
            if (existsAsCustomer) {
                throw new RuntimeException("This Google account is already registered as a customer. Please sign in as customer.");
            }
            Owner o = ownerRepository.findByEmail(email).orElseGet(() -> {
                Owner newO = new Owner();
                newO.setName(name);
                newO.setEmail(email);
                newO.setPassword(passwordEncoder.encode("GOOGLE_AUTH_" + System.currentTimeMillis()));
                return ownerRepository.save(newO);
            });
            String token = jwtUtil.generateToken(o.getEmail(), o.getId(), "owner");
            return new AuthResponse(token, o.getName(), o.getEmail(), "owner", o.getId());
        }
    }
}
