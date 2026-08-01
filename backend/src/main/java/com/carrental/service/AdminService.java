package com.carrental.service;

import com.carrental.config.JwtUtil;
import com.carrental.dto.*;
import com.carrental.model.*;
import com.carrental.repository.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class AdminService {

    private final AdminRepository adminRepository;
    private final CustomerRepository customerRepository;
    private final OwnerRepository ownerRepository;
    private final CarRepository carRepository;
    private final CarMediaRepository carMediaRepository;
    private final TripDetailRepository tripDetailRepository;
    private final DocumentRepository documentRepository;
    private final TransactionRepository transactionRepository;
    private final NotificationService notificationService;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    public AdminService(AdminRepository adminRepository, CustomerRepository customerRepository,
                        OwnerRepository ownerRepository, CarRepository carRepository,
                        CarMediaRepository carMediaRepository,
                        TripDetailRepository tripDetailRepository, DocumentRepository documentRepository,
                        TransactionRepository transactionRepository,
                        NotificationService notificationService,
                        PasswordEncoder passwordEncoder, JwtUtil jwtUtil) {
        this.adminRepository = adminRepository;
        this.customerRepository = customerRepository;
        this.ownerRepository = ownerRepository;
        this.carRepository = carRepository;
        this.carMediaRepository = carMediaRepository;
        this.tripDetailRepository = tripDetailRepository;
        this.documentRepository = documentRepository;
        this.transactionRepository = transactionRepository;
        this.notificationService = notificationService;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
    }

    public Admin findByEmail(String email) {
        return adminRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Admin not found"));
    }

    public AuthResponse login(LoginRequest req) {
        if (req.getEmail() == null || req.getEmail().isBlank()) {
            throw new RuntimeException("Email is required");
        }
        if (req.getPassword() == null || req.getPassword().isBlank()) {
            throw new RuntimeException("Password is required");
        }
        Admin admin = adminRepository.findByEmail(req.getEmail().trim())
                .orElseThrow(() -> new RuntimeException("Invalid admin credentials"));
        if (!passwordEncoder.matches(req.getPassword(), admin.getPassword())) {
            throw new RuntimeException("Invalid admin credentials");
        }
        String token = jwtUtil.generateToken(admin.getEmail(), admin.getId(), "admin");
        return new AuthResponse(token, admin.getName(), admin.getEmail(), "admin", admin.getId());
    }

    /* ================= DOCUMENTS ================= */

    public List<AdminDocumentResponse> listDocuments(String status) {
        List<Document> all = documentRepository.findAll();
        List<Document> filtered = (status == null || status.isBlank() || "all".equalsIgnoreCase(status))
                ? all
                : all.stream().filter(d -> status.equalsIgnoreCase(d.getVerificationStatus())).collect(Collectors.toList());
        return filtered.stream()
                .sorted(Comparator.comparing(Document::getCreatedAt).reversed())
                .map(this::toAdminDocumentResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public AdminDocumentResponse approveDocument(Long docId) {
        Document doc = documentRepository.findById(docId)
                .orElseThrow(() -> new RuntimeException("Document not found"));
        doc.setVerificationStatus("approved");
        doc.setRejectionReason(null);
        documentRepository.save(doc);
        recomputeVerification(doc);
        return toAdminDocumentResponse(doc);
    }

    @Transactional
    public AdminDocumentResponse rejectDocument(Long docId, String reason) {
        Document doc = documentRepository.findById(docId)
                .orElseThrow(() -> new RuntimeException("Document not found"));
        doc.setVerificationStatus("rejected");
        doc.setRejectionReason(reason == null || reason.isBlank() ? "Not accepted" : reason.trim());
        documentRepository.save(doc);
        recomputeVerification(doc);
        return toAdminDocumentResponse(doc);
    }

    /** A user becomes verified only when they have at least one approved document. */
    private void recomputeVerification(Document doc) {
        if (doc.getCustomer() != null) {
            Customer c = doc.getCustomer();
            boolean verified = documentRepository.findByCustomerId(c.getId()).stream()
                    .anyMatch(d -> "approved".equalsIgnoreCase(d.getVerificationStatus()));
            c.setVerified(verified);
            customerRepository.save(c);
        }
        if (doc.getOwner() != null) {
            Owner o = doc.getOwner();
            boolean verified = documentRepository.findByOwnerId(o.getId()).stream()
                    .anyMatch(d -> "approved".equalsIgnoreCase(d.getVerificationStatus()));
            o.setVerified(verified);
            ownerRepository.save(o);
        }
    }

    private AdminDocumentResponse toAdminDocumentResponse(Document d) {
        String userName = null, userEmail = null, role = null;
        if (d.getCustomer() != null) {
            userName = d.getCustomer().getName();
            userEmail = d.getCustomer().getEmail();
            role = "customer";
        } else if (d.getOwner() != null) {
            userName = d.getOwner().getName();
            userEmail = d.getOwner().getEmail();
            role = "owner";
        }
        return new AdminDocumentResponse(d.getId(), d.getDocType(), d.getDocUrl(),
                d.getVerificationStatus(), d.getRejectionReason(),
                d.getCreatedAt() == null ? null : d.getCreatedAt().toString(),
                userName, userEmail, role);
    }

    /* ================= CARS ================= */

    public List<AdminCarResponse> listCars(String status) {
        List<Car> all = carRepository.findAll();
        List<Car> filtered = (status == null || status.isBlank() || "all".equalsIgnoreCase(status))
                ? all
                : all.stream().filter(c -> carStatus(c).equalsIgnoreCase(status)).collect(Collectors.toList());
        return filtered.stream()
                .sorted(Comparator.comparing(Car::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::toAdminCarResponse)
                .collect(Collectors.toList());
    }

    /** pending = not verified, no rejection yet; rejected = not verified + has a rejection reason; approved = verified. */
    private String carStatus(Car c) {
        if (c.isVerified()) return "approved";
        return c.getRejectionReason() == null || c.getRejectionReason().isBlank() ? "pending" : "rejected";
    }

    @Transactional
    public AdminCarResponse approveCar(Long carId) {
        Car car = carRepository.findById(carId)
                .orElseThrow(() -> new RuntimeException("Car not found"));
        car.setVerified(true);
        car.setRejectionReason(null);
        car.setUpdatedAt(java.time.LocalDateTime.now());
        carRepository.save(car);
        if (car.getOwner() != null) {
            String name = car.getMake() + " " + car.getModel();
            notificationService.create(car.getOwner(), "car_approved", "Car approved 🎉",
                    "Your " + name + " is now live on the marketplace and customers can book it.",
                    car.getId());
        }
        return toAdminCarResponse(car);
    }

    @Transactional
    public AdminCarResponse rejectCar(Long carId, String reason) {
        Car car = carRepository.findById(carId)
                .orElseThrow(() -> new RuntimeException("Car not found"));
        car.setVerified(false);
        car.setRejectionReason(reason == null || reason.isBlank() ? "Not accepted" : reason.trim());
        car.setUpdatedAt(java.time.LocalDateTime.now());
        carRepository.save(car);
        if (car.getOwner() != null) {
            String name = car.getMake() + " " + car.getModel();
            notificationService.create(car.getOwner(), "car_rejected", "Car not approved",
                    "Your " + name + " was rejected: " + car.getRejectionReason()
                            + ". Edit and save the car to re-submit it for review.",
                    car.getId());
        }
        return toAdminCarResponse(car);
    }

    private AdminCarResponse toAdminCarResponse(Car c) {
        String image = null;
        if (c.getId() != null) {
            List<CarMedia> media = carMediaRepository.findByCarId(c.getId());
            image = media.stream()
                    .filter(CarMedia::isPrimary)
                    .map(CarMedia::getMediaUrl)
                    .findFirst()
                    .orElse(media.isEmpty() ? null : media.get(0).getMediaUrl());
        }
        String ownerName = null, ownerEmail = null;
        if (c.getOwner() != null) {
            ownerName = c.getOwner().getName();
            ownerEmail = c.getOwner().getEmail();
        }
        return new AdminCarResponse(c.getId(), c.getMake(), c.getModel(), c.getYear(),
                c.getRegistrationNumber(), c.getFuelType(), c.getTransmission(), c.getSeats(),
                c.getPricePerDay(), c.getPricePerHour(), c.getPricingMode(), c.getCity(),
                c.isAvailable(), c.isVerified(), c.getRejectionReason(), image,
                c.getCreatedAt() == null ? null : c.getCreatedAt().toString(),
                ownerName, ownerEmail);
    }

    /* ================= USERS ================= */

    public List<AdminUserResponse> listUsers() {
        List<AdminUserResponse> users = new ArrayList<>();
        customerRepository.findAll().forEach(c -> {
            long pending = documentRepository.findByCustomerId(c.getId()).stream()
                    .filter(d -> "pending".equalsIgnoreCase(d.getVerificationStatus())).count();
            users.add(new AdminUserResponse(c.getId(), c.getName(), c.getEmail(), c.getCity(),
                    "customer", c.isVerified(), pending,
                    c.getCreatedAt() == null ? null : c.getCreatedAt().toString()));
        });
        ownerRepository.findAll().forEach(o -> {
            long pending = documentRepository.findByOwnerId(o.getId()).stream()
                    .filter(d -> "pending".equalsIgnoreCase(d.getVerificationStatus())).count();
            users.add(new AdminUserResponse(o.getId(), o.getName(), o.getEmail(), o.getCity(),
                    "owner", o.isVerified(), pending,
                    o.getCreatedAt() == null ? null : o.getCreatedAt().toString()));
        });
        users.sort(Comparator.comparing(AdminUserResponse::getCreatedAt,
                Comparator.nullsLast(Comparator.reverseOrder())));
        return users;
    }

    /* ================= STATS ================= */

    public AdminStatsResponse stats() {
        AdminStatsResponse s = new AdminStatsResponse();
        s.setCustomers(customerRepository.count());
        s.setOwners(ownerRepository.count());
        s.setCars(carRepository.count());
        s.setTrips(tripDetailRepository.count());
        s.setPendingDocuments(documentRepository.findAll().stream()
                .filter(d -> "pending".equalsIgnoreCase(d.getVerificationStatus())).count());
        s.setPendingCars(carRepository.findAll().stream()
                .filter(c -> !c.isVerified() && (c.getRejectionReason() == null || c.getRejectionReason().isBlank()))
                .count());
        List<TripDetail> trips = tripDetailRepository.findAll();
        s.setPendingTrips(trips.stream()
                .filter(t -> "pending".equalsIgnoreCase(t.getStatus())).count());

        BigDecimal payouts = BigDecimal.ZERO, revenue = BigDecimal.ZERO;
        for (Transaction tx : transactionRepository.findAll()) {
            if ("paid".equalsIgnoreCase(tx.getStatus())) {
                payouts = payouts.add(tx.getOwnerPayout() == null ? BigDecimal.ZERO : tx.getOwnerPayout());
                revenue = revenue.add(tx.getPlatformFee() == null ? BigDecimal.ZERO : tx.getPlatformFee());
            }
        }
        s.setTotalPayouts(payouts);
        s.setPlatformRevenue(revenue);
        return s;
    }
}
