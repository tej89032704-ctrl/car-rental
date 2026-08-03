package com.carrental.config;

import com.carrental.model.Admin;
import com.carrental.repository.AdminRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
public class AdminSeeder {

    @Bean
    public CommandLineRunner seedAdmin(AdminRepository adminRepository, PasswordEncoder passwordEncoder) {
        return args -> {
            if (!adminRepository.existsByEmail("admin@carrental.app")) {
                Admin admin = new Admin();
                admin.setName("Super Admin");
                admin.setEmail("admin@carrental.app");
                admin.setPassword(passwordEncoder.encode("admin123"));
                admin.setRole("admin");
                adminRepository.save(admin);
            } else {
                // Existing deployments: keep the super admin's role explicit.
                adminRepository.findByEmail("admin@carrental.app").ifPresent(a -> {
                    if (a.getRole() == null) {
                        a.setRole("admin");
                        adminRepository.save(a);
                    }
                });
            }
            if (!adminRepository.existsByEmail("agent@carrental.app")) {
                Admin agent = new Admin();
                agent.setName("Verification Agent");
                agent.setEmail("agent@carrental.app");
                agent.setPassword(passwordEncoder.encode("agent123"));
                agent.setRole("agent");
                adminRepository.save(agent);
            }
        };
    }
}
