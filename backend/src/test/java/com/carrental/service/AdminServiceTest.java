package com.carrental.service;

import com.carrental.config.JwtUtil;
import com.carrental.dto.AdminCarResponse;
import com.carrental.dto.AdminDocumentResponse;
import com.carrental.dto.AdminStatsResponse;
import com.carrental.dto.AdminUserResponse;
import com.carrental.dto.AuthResponse;
import com.carrental.dto.LoginRequest;
import com.carrental.model.Admin;
import com.carrental.model.Car;
import com.carrental.model.CarMedia;
import com.carrental.model.Customer;
import com.carrental.model.Document;
import com.carrental.model.Owner;
import com.carrental.model.Transaction;
import com.carrental.model.TripDetail;
import com.carrental.repository.AdminRepository;
import com.carrental.repository.CarMediaRepository;
import com.carrental.repository.CarRepository;
import com.carrental.repository.CustomerRepository;
import com.carrental.repository.DocumentRepository;
import com.carrental.repository.OwnerRepository;
import com.carrental.repository.TransactionRepository;
import com.carrental.repository.TripDetailRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminServiceTest {

    @Mock
    private AdminRepository adminRepository;
    @Mock
    private CustomerRepository customerRepository;
    @Mock
    private OwnerRepository ownerRepository;
    @Mock
    private CarRepository carRepository;
    @Mock
    private CarMediaRepository carMediaRepository;
    @Mock
    private TripDetailRepository tripDetailRepository;
    @Mock
    private DocumentRepository documentRepository;
    @Mock
    private TransactionRepository transactionRepository;
    @Mock
    private NotificationService notificationService;
    @Mock
    private PasswordEncoder passwordEncoder;
    @Mock
    private JwtUtil jwtUtil;

    @InjectMocks
    private AdminService adminService;

    /* ================= fixtures ================= */

    private Admin admin() {
        Admin a = new Admin();
        a.setId(1L);
        a.setName("Super Admin");
        a.setEmail("admin@carrental.app");
        a.setPassword("$2a$10$hashed");
        return a;
    }

    private Customer customer(Long id, boolean verified) {
        Customer c = new Customer();
        c.setId(id);
        c.setName("Amit");
        c.setEmail("amit@mail.com");
        c.setCity("Pune");
        c.setVerified(verified);
        c.setCreatedAt(LocalDateTime.of(2026, 7, 1, 10, 0));
        return c;
    }

    private Owner owner(Long id, boolean verified) {
        Owner o = new Owner();
        o.setId(id);
        o.setName("Ravi");
        o.setEmail("ravi@owner.com");
        o.setCity("Pune");
        o.setVerified(verified);
        o.setCreatedAt(LocalDateTime.of(2026, 7, 2, 10, 0));
        return o;
    }

    private Document customerDoc(Long id, String status, Customer c) {
        Document d = new Document();
        d.setId(id);
        d.setCustomer(c);
        d.setDocType("Driving License");
        d.setDocUrl("http://img/license.jpg");
        d.setVerificationStatus(status);
        d.setCreatedAt(LocalDateTime.now());
        return d;
    }

    private Car car(Long id, boolean verified, String rejectionReason, Owner o) {
        Car c = new Car();
        c.setId(id);
        c.setOwner(o);
        c.setMake("Maruti");
        c.setModel("Swift");
        c.setYear(2022);
        c.setPricePerDay(new BigDecimal("1200.00"));
        c.setPricePerHour(new BigDecimal("150.00"));
        c.setPricingMode("BOTH");
        c.setCity("Pune");
        c.setVerified(verified);
        c.setRejectionReason(rejectionReason);
        c.setCreatedAt(LocalDateTime.of(2026, 7, 5, 10, 0));
        return c;
    }

    /* ================= LOGIN ================= */

    @Test
    void login_success_returnsAdminToken() {
        Admin a = admin();
        LoginRequest req = new LoginRequest();
        req.setEmail(" admin@carrental.app ");
        req.setPassword("admin123");
        when(adminRepository.findByEmail("admin@carrental.app")).thenReturn(Optional.of(a));
        when(passwordEncoder.matches("admin123", a.getPassword())).thenReturn(true);
        when(jwtUtil.generateToken(a.getEmail(), a.getId(), "admin")).thenReturn("jwt-token");

        AuthResponse resp = adminService.login(req);

        assertEquals("jwt-token", resp.getToken());
        assertEquals("admin", resp.getRole());
        assertEquals("Super Admin", resp.getName());
    }

    @Test
    void login_rejectsUnknownEmail() {
        LoginRequest req = new LoginRequest();
        req.setEmail("nope@mail.com");
        req.setPassword("admin123");
        when(adminRepository.findByEmail("nope@mail.com")).thenReturn(Optional.empty());

        assertThrows(RuntimeException.class, () -> adminService.login(req));
    }

    @Test
    void login_rejectsWrongPassword() {
        Admin a = admin();
        LoginRequest req = new LoginRequest();
        req.setEmail("admin@carrental.app");
        req.setPassword("wrong");
        when(adminRepository.findByEmail("admin@carrental.app")).thenReturn(Optional.of(a));
        when(passwordEncoder.matches("wrong", a.getPassword())).thenReturn(false);

        assertThrows(RuntimeException.class, () -> adminService.login(req));
    }

    /* ================= DOCUMENTS ================= */

    @Test
    void approveDocument_marksApprovedAndVerifiesCustomer() {
        Customer c = customer(10L, false);
        Document d = customerDoc(100L, "pending", c);
        when(documentRepository.findById(100L)).thenReturn(Optional.of(d));
        when(documentRepository.findByCustomerId(10L)).thenReturn(List.of(d));
        when(documentRepository.save(any(Document.class))).thenAnswer(inv -> inv.getArgument(0));
        when(customerRepository.save(any(Customer.class))).thenAnswer(inv -> inv.getArgument(0));

        AdminDocumentResponse resp = adminService.approveDocument(100L);

        assertEquals("approved", resp.getVerificationStatus());
        assertEquals("Amit", resp.getUserName());
        assertEquals("customer", resp.getRole());
        assertTrue(c.isVerified());
        verify(customerRepository).save(c);
    }

    @Test
    void approveDocument_keepsUnverifiedWhenNoApprovedDocs() {
        Customer c = customer(10L, false);
        Document d1 = customerDoc(100L, "pending", c);
        Document d2 = customerDoc(101L, "rejected", c);
        when(documentRepository.findById(100L)).thenReturn(Optional.of(d1));
        when(documentRepository.findByCustomerId(10L)).thenReturn(List.of(d1, d2));
        when(documentRepository.save(any(Document.class))).thenAnswer(inv -> inv.getArgument(0));
        when(customerRepository.save(any(Customer.class))).thenAnswer(inv -> inv.getArgument(0));

        adminService.approveDocument(100L);

        // d2 is still rejected, so the customer must stay unverified
        assertFalse(c.isVerified());
    }

    @Test
    void rejectDocument_setsReasonAndUnverifiesOwner() {
        Owner o = owner(20L, true);
        Document d = new Document();
        d.setId(200L);
        d.setOwner(o);
        d.setDocType("Registration");
        d.setDocUrl("http://img/reg.jpg");
        d.setVerificationStatus("pending");
        when(documentRepository.findById(200L)).thenReturn(Optional.of(d));
        when(documentRepository.findByOwnerId(20L)).thenReturn(List.of(d));
        when(documentRepository.save(any(Document.class))).thenAnswer(inv -> inv.getArgument(0));
        when(ownerRepository.save(any(Owner.class))).thenAnswer(inv -> inv.getArgument(0));

        AdminDocumentResponse resp = adminService.rejectDocument(200L, "Blurry image");

        assertEquals("rejected", resp.getVerificationStatus());
        assertEquals("Blurry image", resp.getRejectionReason());
        assertFalse(o.isVerified());
    }

    @Test
    void rejectDocument_defaultsReasonWhenBlank() {
        Owner o = owner(20L, true);
        Document d = new Document();
        d.setId(200L);
        d.setOwner(o);
        d.setVerificationStatus("pending");
        when(documentRepository.findById(200L)).thenReturn(Optional.of(d));
        when(documentRepository.findByOwnerId(20L)).thenReturn(List.of(d));
        when(documentRepository.save(any(Document.class))).thenAnswer(inv -> inv.getArgument(0));
        when(ownerRepository.save(any(Owner.class))).thenAnswer(inv -> inv.getArgument(0));

        AdminDocumentResponse resp = adminService.rejectDocument(200L, "   ");

        assertEquals("Not accepted", resp.getRejectionReason());
    }

    @Test
    void listDocuments_filtersByStatus() {
        Customer c = customer(10L, false);
        Document pending = customerDoc(100L, "pending", c);
        Document approved = customerDoc(101L, "approved", c);
        when(documentRepository.findAll()).thenReturn(List.of(pending, approved));

        List<AdminDocumentResponse> onlyPending = adminService.listDocuments("pending");
        List<AdminDocumentResponse> all = adminService.listDocuments(null);

        assertEquals(1, onlyPending.size());
        assertEquals("pending", onlyPending.get(0).getVerificationStatus());
        assertEquals(2, all.size());
    }

    /* ================= CARS ================= */

    @Test
    void listCars_filtersByVerificationStatus() {
        Owner o = owner(20L, true);
        Car pending = car(1L, false, null, o);
        Car approved = car(2L, true, null, o);
        Car rejected = car(3L, false, "No insurance docs", o);
        when(carRepository.findAll()).thenReturn(List.of(pending, approved, rejected));
        when(carMediaRepository.findByCarId(any(Long.class))).thenReturn(List.of());

        List<AdminCarResponse> onlyPending = adminService.listCars("pending");
        List<AdminCarResponse> onlyApproved = adminService.listCars("approved");
        List<AdminCarResponse> onlyRejected = adminService.listCars("rejected");
        List<AdminCarResponse> all = adminService.listCars(null);

        assertEquals(1, onlyPending.size());
        assertEquals(1, onlyApproved.size());
        assertEquals(1, onlyRejected.size());
        assertEquals(3, all.size());
        assertEquals(1L, onlyPending.get(0).getId().longValue());
        assertEquals("Ravi", onlyPending.get(0).getOwnerName());
        assertEquals("ravi@owner.com", onlyPending.get(0).getOwnerEmail());
    }

    @Test
    void approveCar_marksVerifiedAndClearsRejectionReason() {
        Owner o = owner(20L, true);
        Car c = car(1L, false, "Blurry photos", o);
        when(carRepository.findById(1L)).thenReturn(Optional.of(c));
        when(carRepository.save(any(Car.class))).thenAnswer(inv -> inv.getArgument(0));
        when(carMediaRepository.findByCarId(1L)).thenReturn(List.of());

        AdminCarResponse resp = adminService.approveCar(1L);

        assertTrue(resp.isVerified());
        assertNull(resp.getRejectionReason());
        assertTrue(c.isVerified());
        assertNull(c.getRejectionReason());
        verify(carRepository).save(c);
    }

    @Test
    void approveCar_notifiesOwner() {
        Owner o = owner(20L, true);
        Car c = car(1L, false, null, o);
        when(carRepository.findById(1L)).thenReturn(Optional.of(c));
        when(carRepository.save(any(Car.class))).thenAnswer(inv -> inv.getArgument(0));
        when(carMediaRepository.findByCarId(1L)).thenReturn(List.of());

        adminService.approveCar(1L);

        verify(notificationService).create(eq(o), eq("car_approved"), any(String.class), any(String.class), eq(1L));
    }

    @Test
    void rejectCar_setsReasonAndKeepsUnverified() {
        Owner o = owner(20L, true);
        Car c = car(1L, false, null, o);
        when(carRepository.findById(1L)).thenReturn(Optional.of(c));
        when(carRepository.save(any(Car.class))).thenAnswer(inv -> inv.getArgument(0));
        when(carMediaRepository.findByCarId(1L)).thenReturn(List.of());

        AdminCarResponse resp = adminService.rejectCar(1L, "No registration details");

        assertEquals("No registration details", resp.getRejectionReason());
        assertFalse(resp.isVerified());
        assertEquals("No registration details", c.getRejectionReason());
        assertFalse(c.isVerified());
        verify(notificationService).create(eq(o), eq("car_rejected"), any(String.class), any(String.class), eq(1L));
    }

    @Test
    void rejectCar_defaultsReasonWhenBlank() {
        Owner o = owner(20L, true);
        Car c = car(1L, false, null, o);
        when(carRepository.findById(1L)).thenReturn(Optional.of(c));
        when(carRepository.save(any(Car.class))).thenAnswer(inv -> inv.getArgument(0));
        when(carMediaRepository.findByCarId(1L)).thenReturn(List.of());

        AdminCarResponse resp = adminService.rejectCar(1L, "   ");

        assertEquals("Not accepted", resp.getRejectionReason());
    }

    @Test
    void approveCar_throwsWhenNotFound() {
        when(carRepository.findById(99L)).thenReturn(Optional.empty());
        assertThrows(RuntimeException.class, () -> adminService.approveCar(99L));
    }

    /* ================= USERS & STATS ================= */

    @Test
    void listUsers_includesBothRolesWithPendingCounts() {
        Customer c = customer(10L, true);
        Owner o = owner(20L, false);
        when(customerRepository.findAll()).thenReturn(List.of(c));
        when(ownerRepository.findAll()).thenReturn(List.of(o));
        when(documentRepository.findByCustomerId(10L)).thenReturn(List.of(customerDoc(100L, "pending", c)));
        when(documentRepository.findByOwnerId(20L)).thenReturn(List.of());

        List<AdminUserResponse> users = adminService.listUsers();

        assertEquals(2, users.size());
        AdminUserResponse cu = users.stream().filter(u -> "customer".equals(u.getRole())).findFirst().orElseThrow();
        AdminUserResponse ou = users.stream().filter(u -> "owner".equals(u.getRole())).findFirst().orElseThrow();
        assertEquals(1, cu.getPendingDocs());
        assertTrue(cu.isVerified());
        assertFalse(ou.isVerified());
        assertEquals(0, ou.getPendingDocs());
    }

    @Test
    void stats_countsEntitiesAndSumsOnlyPaidTransactions() {
        when(customerRepository.count()).thenReturn(5L);
        when(ownerRepository.count()).thenReturn(3L);
        when(carRepository.count()).thenReturn(8L);
        when(tripDetailRepository.count()).thenReturn(12L);
        when(documentRepository.findAll()).thenReturn(List.of(customerDoc(1L, "pending", customer(1L, false))));
        when(carRepository.findAll()).thenReturn(List.of(
                car(1L, false, null, owner(20L, true)),   // pending
                car(2L, true, null, owner(21L, true)),    // approved
                car(3L, false, "Bad docs", owner(22L, true)) // rejected
        ));
        when(tripDetailRepository.findAll()).thenReturn(List.of(new TripDetail(), new TripDetail()));

        Transaction paid = new Transaction();
        paid.setStatus("paid");
        paid.setOwnerPayout(new BigDecimal("270.00"));
        paid.setPlatformFee(new BigDecimal("30.00"));
        Transaction refunded = new Transaction();
        refunded.setStatus("refunded");
        refunded.setOwnerPayout(new BigDecimal("500.00"));
        refunded.setPlatformFee(new BigDecimal("50.00"));
        when(transactionRepository.findAll()).thenReturn(List.of(paid, refunded));

        AdminStatsResponse s = adminService.stats();

        assertEquals(5, s.getCustomers());
        assertEquals(3, s.getOwners());
        assertEquals(8, s.getCars());
        assertEquals(12, s.getTrips());
        assertEquals(1, s.getPendingDocuments());
        assertEquals(1, s.getPendingCars());
        assertEquals(0, s.getPendingTrips());
        assertEquals(0, new BigDecimal("270.00").compareTo(s.getTotalPayouts()));
        assertEquals(0, new BigDecimal("30.00").compareTo(s.getPlatformRevenue()));
        verify(transactionRepository).findAll();
        verify(tripDetailRepository, never()).delete(any(TripDetail.class));
    }
}
