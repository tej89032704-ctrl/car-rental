package com.carrental.service;

import com.carrental.dto.CarCardResponse;
import com.carrental.dto.CarDetailResponse;
import com.carrental.dto.CustomerProfileResponse;
import com.carrental.dto.DocumentRequest;
import com.carrental.dto.DocumentResponse;
import com.carrental.dto.TransactionResponse;
import com.carrental.dto.TripRequest;
import com.carrental.dto.TripResponse;
import com.carrental.dto.UpdateProfileRequest;
import com.carrental.model.Car;
import com.carrental.model.CarMedia;
import com.carrental.model.Customer;
import com.carrental.model.Document;
import com.carrental.model.Owner;
import com.carrental.model.Transaction;
import com.carrental.model.TripDetail;
import com.carrental.repository.CarMediaRepository;
import com.carrental.repository.CarRepository;
import com.carrental.repository.CustomerRepository;
import com.carrental.repository.DocumentRepository;
import com.carrental.repository.OwnerRepository;
import com.carrental.repository.TransactionRepository;
import com.carrental.repository.TripDetailRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
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
class CustomerServiceTest {

    @Mock
    private CustomerRepository customerRepository;
    @Mock
    private CarRepository carRepository;
    @Mock
    private CarMediaRepository carMediaRepository;
    @Mock
    private TripDetailRepository tripDetailRepository;
    @Mock
    private TransactionRepository transactionRepository;
    @Mock
    private DocumentRepository documentRepository;
    @Mock
    private OwnerRepository ownerRepository;

    @InjectMocks
    private CustomerService customerService;

    /* ================= fixtures ================= */

    private Customer customer(Long id, String name, String email) {
        Customer c = new Customer();
        c.setId(id);
        c.setName(name);
        c.setEmail(email);
        c.setPhone("9876543210");
        c.setCity("Pune");
        c.setVerified(true);
        c.setCreatedAt(LocalDateTime.of(2026, 7, 1, 10, 0));
        return c;
    }

    private Owner owner(Long id) {
        Owner o = new Owner();
        o.setId(id);
        o.setName("Ravi Kumar");
        o.setEmail("ravi@owner.com");
        o.setCity("Pune");
        o.setVerified(true);
        return o;
    }

    private Car car(Long id, String make, String model, BigDecimal price, String city,
                    boolean available, boolean verified, Owner owner) {
        Car c = new Car();
        c.setId(id);
        c.setMake(make);
        c.setModel(model);
        c.setYear(2022);
        c.setFuelType("Petrol");
        c.setTransmission("Manual");
        c.setSeats(5);
        c.setPricePerDay(price);
        c.setCity(city);
        c.setAvailable(available);
        c.setVerified(verified);
        c.setOwner(owner);
        return c;
    }

    private TripRequest tripRequest(Long carId, LocalDate start, LocalDate end) {
        TripRequest req = new TripRequest();
        req.setCarId(carId);
        req.setStartDate(start.toString());
        req.setEndDate(end.toString());
        req.setStartLocation("Pune Airport");
        req.setEndLocation("Pune Station");
        req.setPaymentMethod("upi");
        return req;
    }

    /* ================= PROFILE ================= */

    @Test
    void getProfile_mapsAllFields() {
        Customer c = customer(1L, "Amit", "amit@mail.com");

        CustomerProfileResponse resp = customerService.getProfile(c);

        assertEquals(1L, resp.getId());
        assertEquals("Amit", resp.getName());
        assertEquals("amit@mail.com", resp.getEmail());
        assertEquals("9876543210", resp.getPhone());
        assertEquals("Pune", resp.getCity());
        assertTrue(resp.isVerified());
        assertEquals("2026-07-01T10:00", resp.getCreatedAt());
    }

    @Test
    void updateProfile_updatesFieldsAndSaves() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        UpdateProfileRequest req = new UpdateProfileRequest();
        req.setName("  Amit Sharma ");
        req.setPhone("9123456789");
        req.setCity("Mumbai");

        CustomerProfileResponse resp = customerService.updateProfile(c, req);

        assertEquals("Amit Sharma", c.getName());
        assertEquals("9123456789", c.getPhone());
        assertEquals("Mumbai", c.getCity());
        assertNotNull(c.getUpdatedAt());
        verify(customerRepository).save(c);
        assertEquals("Amit Sharma", resp.getName());
        assertEquals("Mumbai", resp.getCity());
    }

    /* ================= CARS ================= */

    @Test
    void listCars_filtersAndSortsVerifiedAvailableCars() {
        Owner owner = owner(5L);
        Car honda = car(1L, "Honda", "City", new BigDecimal("500.00"), "Pune", true, true, owner);
        Car toyota = car(2L, "Toyota", "Innova", new BigDecimal("300.00"), "Pune", true, true, owner);
        Car unverified = car(3L, "Swift", "VXI", new BigDecimal("200.00"), "Pune", true, false, owner);
        Car unavailable = car(4L, "Nexon", "EV", new BigDecimal("400.00"), "Pune", false, true, owner);
        Car wrongCity = car(5L, "City", "Zeta", new BigDecimal("250.00"), "Mumbai", true, true, owner);
        when(carRepository.findAll()).thenReturn(List.of(honda, toyota, unverified, unavailable, wrongCity));

        List<CarCardResponse> result = customerService.listCars("Pune", null, null, null, null, null);

        assertEquals(2, result.size());
        // sorted by price ascending
        assertEquals("Toyota", result.get(0).getMake());
        assertEquals("Honda", result.get(1).getMake());
        verify(carRepository).findAll();
    }

    @Test
    void listCars_appliesPriceRangeAndSearch() {
        Owner owner = owner(5L);
        Car honda = car(1L, "Honda", "City", new BigDecimal("500.00"), "Pune", true, true, owner);
        Car swift = car(2L, "Maruti", "Swift", new BigDecimal("200.00"), "Pune", true, true, owner);
        when(carRepository.findAll()).thenReturn(List.of(honda, swift));

        List<CarCardResponse> result = customerService.listCars(null, null, null,
                new BigDecimal("300.00"), new BigDecimal("600.00"), "honda");

        assertEquals(1, result.size());
        assertEquals("Honda", result.get(0).getMake());
    }

    @Test
    void getCarDetail_mapsFieldsOwnerAndMedia() {
        Owner owner = owner(5L);
        Car c = car(10L, "Honda", "City", new BigDecimal("500.00"), "Pune", true, true, owner);
        CarMedia first = new CarMedia();
        first.setId(1L);
        first.setMediaUrl("http://img/b.jpg");
        first.setPrimary(false);
        first.setDisplayOrder(0);
        CarMedia second = new CarMedia();
        second.setId(2L);
        second.setMediaUrl("http://img/a.jpg");
        second.setPrimary(true);
        second.setDisplayOrder(1);
        when(carRepository.findById(10L)).thenReturn(Optional.of(c));
        when(carMediaRepository.findByCarId(10L)).thenReturn(List.of(first, second));

        CarDetailResponse resp = customerService.getCarDetail(10L);

        assertEquals("Honda", resp.getMake());
        assertEquals("City", resp.getModel());
        assertEquals(new BigDecimal("500.00"), resp.getPricePerDay());
        assertEquals("Ravi Kumar", resp.getOwnerName());
        assertEquals("Pune", resp.getOwnerCity());
        assertEquals(List.of("http://img/b.jpg", "http://img/a.jpg"), resp.getMediaUrls());
        assertEquals("http://img/a.jpg", resp.getPrimaryImage());
    }

    @Test
    void getCarDetail_throwsWhenCarNotFound() {
        when(carRepository.findById(99L)).thenReturn(Optional.empty());

        assertThrows(RuntimeException.class, () -> customerService.getCarDetail(99L));
    }

    /* ================= TRIPS ================= */

    @Test
    void createTrip_success_createsTripAndTransactionWithPlatformFee() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        Owner owner = owner(5L);
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, true, owner);
        when(carRepository.findById(10L)).thenReturn(Optional.of(car));
        when(tripDetailRepository.findByCarId(10L)).thenReturn(List.of());
        when(tripDetailRepository.save(any(TripDetail.class))).thenAnswer(inv -> {
            TripDetail t = inv.getArgument(0);
            t.setId(100L);
            return t;
        });
        when(transactionRepository.save(any(Transaction.class))).thenAnswer(inv -> {
            Transaction tx = inv.getArgument(0);
            tx.setId(200L);
            return tx;
        });

        LocalDate start = LocalDate.now().plusDays(5);
        LocalDate end = start.plusDays(3);
        TripResponse resp = customerService.createTrip(c, tripRequest(10L, start, end));

        // 3 days x 100.00 = 300.00 total, 10% fee = 30.00, payout = 270.00
        assertEquals("confirmed", resp.getStatus());
        assertEquals(new BigDecimal("300.00"), resp.getTotalAmount());
        assertEquals(new BigDecimal("30.00"), resp.getPlatformFee());
        assertEquals(new BigDecimal("270.00"), resp.getOwnerPayout());
        assertEquals("upi", resp.getPaymentMethod());
        assertEquals("Honda City", resp.getCarName());

        ArgumentCaptor<Transaction> txCaptor = ArgumentCaptor.forClass(Transaction.class);
        verify(transactionRepository).save(txCaptor.capture());
        Transaction tx = txCaptor.getValue();
        assertEquals(new BigDecimal("300.00"), tx.getAmount());
        assertEquals(new BigDecimal("30.00"), tx.getPlatformFee());
        assertEquals(new BigDecimal("270.00"), tx.getOwnerPayout());
        assertEquals("paid", tx.getStatus());
        assertEquals("upi", tx.getPaymentMethod());
        assertEquals(car, tx.getTrip().getCar());
    }

    @Test
    void createTrip_throwsWhenCarUnavailable() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", false, true, owner(5L));
        when(carRepository.findById(10L)).thenReturn(Optional.of(car));

        LocalDate start = LocalDate.now().plusDays(2);
        RuntimeException ex = assertThrows(RuntimeException.class,
                () -> customerService.createTrip(c, tripRequest(10L, start, start.plusDays(1))));
        assertTrue(ex.getMessage().contains("not available"));
    }

    @Test
    void createTrip_throwsWhenCarUnverified() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, false, owner(5L));
        when(carRepository.findById(10L)).thenReturn(Optional.of(car));

        LocalDate start = LocalDate.now().plusDays(2);
        RuntimeException ex = assertThrows(RuntimeException.class,
                () -> customerService.createTrip(c, tripRequest(10L, start, start.plusDays(1))));
        assertTrue(ex.getMessage().contains("not verified"));
    }

    @Test
    void createTrip_throwsWhenStartDateInPast() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, true, owner(5L));
        when(carRepository.findById(10L)).thenReturn(Optional.of(car));

        LocalDate start = LocalDate.now().minusDays(2);
        RuntimeException ex = assertThrows(RuntimeException.class,
                () -> customerService.createTrip(c, tripRequest(10L, start, start.plusDays(3))));
        assertTrue(ex.getMessage().contains("past"));
    }

    @Test
    void createTrip_throwsWhenEndDateBeforeStartDate() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, true, owner(5L));
        when(carRepository.findById(10L)).thenReturn(Optional.of(car));

        LocalDate start = LocalDate.now().plusDays(5);
        RuntimeException ex = assertThrows(RuntimeException.class,
                () -> customerService.createTrip(c, tripRequest(10L, start, start.minusDays(1))));
        assertTrue(ex.getMessage().contains("End date"));
    }

    @Test
    void createTrip_throwsWhenDatesOverlapExistingBooking() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, true, owner(5L));
        when(carRepository.findById(10L)).thenReturn(Optional.of(car));

        TripDetail existing = new TripDetail();
        existing.setId(90L);
        existing.setCar(car);
        existing.setStatus("confirmed");
        existing.setStartDate(LocalDate.now().plusDays(6));
        existing.setEndDate(LocalDate.now().plusDays(8));
        when(tripDetailRepository.findByCarId(10L)).thenReturn(List.of(existing));

        LocalDate start = LocalDate.now().plusDays(5);
        LocalDate end = LocalDate.now().plusDays(7);
        RuntimeException ex = assertThrows(RuntimeException.class,
                () -> customerService.createTrip(c, tripRequest(10L, start, end)));
        assertTrue(ex.getMessage().contains("already booked"));
    }

    @Test
    void listTrips_filtersByStatus() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        TripDetail confirmed = trip(c, 100L, "confirmed");
        TripDetail pending = trip(c, 101L, "pending");
        when(tripDetailRepository.findByCustomerId(1L)).thenReturn(List.of(confirmed, pending));

        List<TripResponse> filtered = customerService.listTrips(c, "confirmed");
        assertEquals(1, filtered.size());
        assertEquals(100L, filtered.get(0).getId());

        List<TripResponse> all = customerService.listTrips(c, null);
        assertEquals(2, all.size());
    }

    @Test
    void getTrip_throwsWhenTripBelongsToAnotherCustomer() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        TripDetail t = trip(customer(2L, "Other", "other@mail.com"), 100L, "confirmed");
        when(tripDetailRepository.findById(100L)).thenReturn(Optional.of(t));

        assertThrows(RuntimeException.class, () -> customerService.getTrip(c, 100L));
    }

    @Test
    void cancelTrip_marksCancelledAndRefundsTransaction() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        TripDetail t = trip(c, 100L, "confirmed");
        Transaction tx = new Transaction();
        tx.setId(200L);
        tx.setTrip(t);
        tx.setStatus("paid");
        tx.setAmount(new BigDecimal("300.00"));
        when(tripDetailRepository.findById(100L)).thenReturn(Optional.of(t));
        when(tripDetailRepository.save(any(TripDetail.class))).thenAnswer(inv -> inv.getArgument(0));
        when(transactionRepository.findByTripId(100L)).thenReturn(List.of(tx));

        TripResponse resp = customerService.cancelTrip(c, 100L);

        assertEquals("cancelled", resp.getStatus());
        assertEquals("cancelled", t.getStatus());
        assertEquals("refunded", tx.getStatus());
        assertNotNull(t.getUpdatedAt());
        verify(tripDetailRepository).save(t);
    }

    @Test
    void cancelTrip_acceptsWhenInsideWindow() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        // Trip starts 10 hours from now, policy = 24 hours — window NOT passed
        TripDetail t = trip(c, 100L, "confirmed");
        t.setRentalUnit("HOUR");
        t.setStartDateTime(LocalDateTime.now().plusHours(10));
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, true, owner(5L));
        car.setCancelPolicyHours(24);
        t.setCar(car);
        Transaction tx = new Transaction();
        tx.setId(200L);
        tx.setTrip(t);
        tx.setStatus("paid");
        when(tripDetailRepository.findById(100L)).thenReturn(Optional.of(t));
        when(tripDetailRepository.save(any(TripDetail.class))).thenAnswer(inv -> inv.getArgument(0));
        when(transactionRepository.findByTripId(100L)).thenReturn(List.of(tx));

        TripResponse resp = customerService.cancelTrip(c, 100L);

        assertEquals("cancelled", resp.getStatus());
        assertEquals("refunded", tx.getStatus());
    }

    @Test
    void cancelTrip_rejectsWhenOutsideWindow() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        // Trip starts 2 hours from now, policy = 24 hours — window has passed
        TripDetail t = trip(c, 100L, "confirmed");
        t.setRentalUnit("HOUR");
        t.setStartDateTime(LocalDateTime.now().plusHours(2));
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, true, owner(5L));
        car.setCancelPolicyHours(24);
        t.setCar(car);
        when(tripDetailRepository.findById(100L)).thenReturn(Optional.of(t));

        RuntimeException ex = assertThrows(RuntimeException.class, () -> customerService.cancelTrip(c, 100L));
        assertTrue(ex.getMessage().contains("cancellation window"));
        verify(tripDetailRepository, never()).save(any(TripDetail.class));
    }

    @Test
    void cancelTrip_acceptsWhenWindowIsNull() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        // No cancel policy — always allowed
        TripDetail t = trip(c, 100L, "confirmed");
        t.setRentalUnit("HOUR");
        t.setStartDateTime(LocalDateTime.now().plusHours(1));
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, true, owner(5L));
        car.setCancelPolicyHours(null);
        t.setCar(car);
        Transaction tx = new Transaction();
        tx.setId(200L);
        tx.setTrip(t);
        tx.setStatus("paid");
        when(tripDetailRepository.findById(100L)).thenReturn(Optional.of(t));
        when(tripDetailRepository.save(any(TripDetail.class))).thenAnswer(inv -> inv.getArgument(0));
        when(transactionRepository.findByTripId(100L)).thenReturn(List.of(tx));

        TripResponse resp = customerService.cancelTrip(c, 100L);

        assertEquals("cancelled", resp.getStatus());
    }

    @Test
    void cancelTrip_rejectsWhenOutsideWindow_dailyTrip() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        // Daily trip starts tomorrow, policy = 48 hours — window has passed
        TripDetail t = trip(c, 100L, "confirmed");
        t.setStartDate(LocalDate.now().plusDays(1));
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, true, owner(5L));
        car.setCancelPolicyHours(48);
        t.setCar(car);
        when(tripDetailRepository.findById(100L)).thenReturn(Optional.of(t));

        RuntimeException ex = assertThrows(RuntimeException.class, () -> customerService.cancelTrip(c, 100L));
        assertTrue(ex.getMessage().contains("cancellation window"));
        verify(tripDetailRepository, never()).save(any(TripDetail.class));
    }

    @Test
    void cancelTrip_acceptsWhenInsideWindow_dailyTrip() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        // Daily trip starts in 5 days, policy = 24 hours — well inside
        TripDetail t = trip(c, 100L, "confirmed");
        t.setStartDate(LocalDate.now().plusDays(5));
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, true, owner(5L));
        car.setCancelPolicyHours(24);
        t.setCar(car);
        Transaction tx = new Transaction();
        tx.setId(200L);
        tx.setTrip(t);
        tx.setStatus("paid");
        when(tripDetailRepository.findById(100L)).thenReturn(Optional.of(t));
        when(tripDetailRepository.save(any(TripDetail.class))).thenAnswer(inv -> inv.getArgument(0));
        when(transactionRepository.findByTripId(100L)).thenReturn(List.of(tx));

        TripResponse resp = customerService.cancelTrip(c, 100L);

        assertEquals("cancelled", resp.getStatus());
        assertEquals("refunded", tx.getStatus());
    }

    /* ================= DOCUMENTS ================= */

    @Test
    void addDocument_savesDocumentWithPendingStatus() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        DocumentRequest req = new DocumentRequest();
        req.setDocType("  license  ");
        req.setDocUrl(" http://docs/license.pdf ");
        when(documentRepository.save(any(Document.class))).thenAnswer(inv -> {
            Document d = inv.getArgument(0);
            d.setId(50L);
            return d;
        });

        DocumentResponse resp = customerService.addDocument(c, req);

        assertEquals("license", resp.getDocType());
        assertEquals("http://docs/license.pdf", resp.getDocUrl());
        assertEquals("pending", resp.getVerificationStatus());
        verify(documentRepository).save(any(Document.class));
    }

    @Test
    void addDocument_throwsWhenDocTypeMissing() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        DocumentRequest req = new DocumentRequest();
        req.setDocUrl("http://docs/a.pdf");

        assertThrows(RuntimeException.class, () -> customerService.addDocument(c, req));
        verify(documentRepository, never()).save(any(Document.class));
    }

    @Test
    void deleteDocument_throwsWhenNotOwnersDocument() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        Document doc = new Document();
        doc.setId(50L);
        doc.setCustomer(customer(2L, "Other", "other@mail.com"));
        when(documentRepository.findById(50L)).thenReturn(Optional.of(doc));

        assertThrows(RuntimeException.class, () -> customerService.deleteDocument(c, 50L));
        verify(documentRepository, never()).delete(any(Document.class));
    }

    /* ================= TRANSACTIONS ================= */

    @Test
    void listTransactions_mapsResponse() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, true, owner(5L));
        TripDetail t = trip(c, 100L, "confirmed");
        t.setCar(car);
        Transaction tx = new Transaction();
        tx.setId(200L);
        tx.setTrip(t);
        tx.setAmount(new BigDecimal("300.00"));
        tx.setPlatformFee(new BigDecimal("30.00"));
        tx.setOwnerPayout(new BigDecimal("270.00"));
        tx.setPaymentMethod("upi");
        tx.setStatus("paid");
        tx.setCreatedAt(LocalDateTime.of(2026, 7, 10, 12, 0));
        when(transactionRepository.findByCustomerId(1L)).thenReturn(List.of(tx));

        List<TransactionResponse> result = customerService.listTransactions(c);

        assertEquals(1, result.size());
        TransactionResponse r = result.get(0);
        assertEquals(100L, r.getTripId());
        assertEquals(10L, r.getCarId());
        assertEquals("Honda City", r.getCarName());
        assertEquals("paid", r.getStatus());
        assertEquals(new BigDecimal("30.00"), r.getPlatformFee());
    }

    /* ================= HELPERS ================= */

    @Test
    void findByEmail_throwsWhenCustomerNotFound() {
        when(customerRepository.findByEmail("nobody@mail.com")).thenReturn(Optional.empty());

        assertThrows(RuntimeException.class, () -> customerService.findByEmail("nobody@mail.com"));
    }

    /* ================= HOURLY BOOKINGS ================= */

    @Test
    void createTrip_hourly_success_createsTripWithHourlyPricing() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, true, owner(5L));
        car.setPricingMode("BOTH");
        car.setPricePerHour(new BigDecimal("50.00"));
        when(carRepository.findById(10L)).thenReturn(Optional.of(car));
        when(tripDetailRepository.findByCarId(10L)).thenReturn(List.of());
        when(tripDetailRepository.save(any(TripDetail.class))).thenAnswer(inv -> {
            TripDetail t = inv.getArgument(0);
            t.setId(101L);
            return t;
        });
        when(transactionRepository.save(any(Transaction.class))).thenAnswer(inv -> {
            Transaction tx = inv.getArgument(0);
            tx.setId(201L);
            return tx;
        });

        LocalDateTime start = LocalDateTime.now().plusHours(2).withSecond(0).withNano(0);
        LocalDateTime end = start.plusMinutes(210); // 3.5h -> rounds up to 4h
        TripRequest req = tripRequest(10L, LocalDate.now(), LocalDate.now());
        req.setRentalUnit("HOUR");
        req.setStartDateTime(start.toString());
        req.setEndDateTime(end.toString());

        TripResponse resp = customerService.createTrip(c, req);

        assertEquals("HOUR", resp.getRentalUnit());
        assertEquals(4, resp.getRentalQty());
        // 4h x 50.00 = 200.00, 10% fee = 20.00, payout = 180.00
        assertEquals(new BigDecimal("200.00"), resp.getTotalAmount());
        assertEquals(new BigDecimal("20.00"), resp.getPlatformFee());
        assertEquals(new BigDecimal("180.00"), resp.getOwnerPayout());
    }

    @Test
    void createTrip_hourly_rejectsCarNotSupportingHourly() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, true, owner(5L));
        car.setPricingMode("DAILY");
        when(carRepository.findById(10L)).thenReturn(Optional.of(car));

        TripRequest req = tripRequest(10L, LocalDate.now(), LocalDate.now());
        req.setRentalUnit("HOUR");
        req.setStartDateTime(LocalDateTime.now().plusHours(2).toString());
        req.setEndDateTime(LocalDateTime.now().plusHours(4).toString());

        RuntimeException ex = assertThrows(RuntimeException.class, () -> customerService.createTrip(c, req));
        assertTrue(ex.getMessage().contains("only available for daily rentals"));
    }

    @Test
    void createTrip_daily_rejectsCarNotSupportingDaily() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, true, owner(5L));
        car.setPricingMode("HOURLY");
        when(carRepository.findById(10L)).thenReturn(Optional.of(car));

        LocalDate start = LocalDate.now().plusDays(2);
        RuntimeException ex = assertThrows(RuntimeException.class,
                () -> customerService.createTrip(c, tripRequest(10L, start, start.plusDays(1))));
        assertTrue(ex.getMessage().contains("only available for hourly rentals"));
    }

    @Test
    void createTrip_hourly_rejectsEndTimeBeforeStartTime() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, true, owner(5L));
        car.setPricingMode("BOTH");
        car.setPricePerHour(new BigDecimal("50.00"));
        when(carRepository.findById(10L)).thenReturn(Optional.of(car));

        TripRequest req = tripRequest(10L, LocalDate.now(), LocalDate.now());
        req.setRentalUnit("HOUR");
        req.setStartDateTime(LocalDateTime.now().plusHours(2).toString());
        req.setEndDateTime(LocalDateTime.now().plusHours(1).toString());

        RuntimeException ex = assertThrows(RuntimeException.class, () -> customerService.createTrip(c, req));
        assertTrue(ex.getMessage().contains("End time"));
    }

    @Test
    void createTrip_hourly_rejectsOverlappingBooking() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, true, owner(5L));
        car.setPricingMode("BOTH");
        car.setPricePerHour(new BigDecimal("50.00"));
        when(carRepository.findById(10L)).thenReturn(Optional.of(car));

        TripDetail existing = new TripDetail();
        existing.setId(90L);
        existing.setCar(car);
        existing.setStatus("confirmed");
        existing.setRentalUnit("HOUR");
        existing.setStartDateTime(LocalDateTime.now().plusHours(3));
        existing.setEndDateTime(LocalDateTime.now().plusHours(5));
        when(tripDetailRepository.findByCarId(10L)).thenReturn(List.of(existing));

        TripRequest req = tripRequest(10L, LocalDate.now(), LocalDate.now());
        req.setRentalUnit("HOUR");
        req.setStartDateTime(LocalDateTime.now().plusHours(2).toString());
        req.setEndDateTime(LocalDateTime.now().plusHours(4).toString());

        RuntimeException ex = assertThrows(RuntimeException.class, () -> customerService.createTrip(c, req));
        assertTrue(ex.getMessage().contains("already booked"));
    }

    @Test
    void createTrip_hourly_rejectsBelowMinimumHours() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, true, owner(5L));
        car.setPricingMode("BOTH");
        car.setPricePerHour(new BigDecimal("50.00"));
        car.setMinHours(4);
        when(carRepository.findById(10L)).thenReturn(Optional.of(car));

        TripRequest req = tripRequest(10L, LocalDate.now(), LocalDate.now());
        req.setRentalUnit("HOUR");
        req.setStartDateTime(LocalDateTime.now().plusHours(2).toString());
        req.setEndDateTime(LocalDateTime.now().plusHours(4).toString());

        RuntimeException ex = assertThrows(RuntimeException.class, () -> customerService.createTrip(c, req));
        assertTrue(ex.getMessage().contains("minimum of 4 hours"));
    }

    @Test
    void createTrip_hourly_rejectsOverMaxHoursPerDay() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, true, owner(5L));
        car.setPricingMode("BOTH");
        car.setPricePerHour(new BigDecimal("50.00"));
        car.setMaxHoursPerDay(8);
        when(carRepository.findById(10L)).thenReturn(Optional.of(car));

        TripRequest req = tripRequest(10L, LocalDate.now(), LocalDate.now());
        req.setRentalUnit("HOUR");
        req.setStartDateTime(LocalDateTime.now().plusHours(1).toString());
        req.setEndDateTime(LocalDateTime.now().plusHours(11).toString());

        RuntimeException ex = assertThrows(RuntimeException.class, () -> customerService.createTrip(c, req));
        assertTrue(ex.getMessage().contains("up to 8 hours"));
    }

    @Test
    void createTrip_hourly_rejectsOvernightWhenSameDayOnly() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, true, owner(5L));
        car.setPricingMode("BOTH");
        car.setPricePerHour(new BigDecimal("50.00"));
        car.setSameDayOnly(true);
        when(carRepository.findById(10L)).thenReturn(Optional.of(car));

        LocalDateTime start = LocalDate.now().plusDays(1).atTime(23, 0);
        TripRequest req = tripRequest(10L, LocalDate.now(), LocalDate.now());
        req.setRentalUnit("HOUR");
        req.setStartDateTime(start.toString());
        req.setEndDateTime(start.plusHours(2).toString()); // 01:00 next day

        RuntimeException ex = assertThrows(RuntimeException.class, () -> customerService.createTrip(c, req));
        assertTrue(ex.getMessage().contains("single day"));
    }

    /* ================= CROSS-UNIT OVERLAP ================= */

    @Test
    void createTrip_hourly_rejectsOverlappingDailyTrip() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, true, owner(5L));
        car.setPricingMode("BOTH");
        car.setPricePerHour(new BigDecimal("50.00"));
        when(carRepository.findById(10L)).thenReturn(Optional.of(car));

        LocalDate day = LocalDate.now().plusDays(5);
        TripDetail existing = new TripDetail();
        existing.setId(90L);
        existing.setCar(car);
        existing.setStatus("confirmed");
        existing.setRentalUnit("DAY");
        existing.setStartDate(day);
        existing.setEndDate(day.plusDays(2));
        when(tripDetailRepository.findByCarId(10L)).thenReturn(List.of(existing));

        TripRequest req = tripRequest(10L, LocalDate.now(), LocalDate.now());
        req.setRentalUnit("HOUR");
        req.setStartDateTime(day.atTime(14, 0).toString());
        req.setEndDateTime(day.atTime(16, 0).toString());

        RuntimeException ex = assertThrows(RuntimeException.class, () -> customerService.createTrip(c, req));
        assertTrue(ex.getMessage().contains("already booked"));
    }

    @Test
    void createTrip_daily_rejectsOverlappingHourlyTrip() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, true, owner(5L));
        car.setPricingMode("BOTH");
        when(carRepository.findById(10L)).thenReturn(Optional.of(car));

        LocalDate day = LocalDate.now().plusDays(5);
        TripDetail existing = new TripDetail();
        existing.setId(91L);
        existing.setCar(car);
        existing.setStatus("confirmed");
        existing.setRentalUnit("HOUR");
        existing.setStartDateTime(day.atTime(10, 0));
        existing.setEndDateTime(day.atTime(12, 0));
        when(tripDetailRepository.findByCarId(10L)).thenReturn(List.of(existing));

        RuntimeException ex = assertThrows(RuntimeException.class,
                () -> customerService.createTrip(c, tripRequest(10L, day, day.plusDays(1))));
        assertTrue(ex.getMessage().contains("already booked"));
    }

    @Test
    void createTrip_daily_rejectsOverlappingLegacyTripWithoutRentalUnit() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, true, owner(5L));
        when(carRepository.findById(10L)).thenReturn(Optional.of(car));

        LocalDate day = LocalDate.now().plusDays(5);
        TripDetail legacy = new TripDetail();
        legacy.setId(92L);
        legacy.setCar(car);
        legacy.setStatus("confirmed");
        legacy.setRentalUnit(null); // rows created before the hourly feature
        legacy.setStartDate(day);
        legacy.setEndDate(day.plusDays(2));
        when(tripDetailRepository.findByCarId(10L)).thenReturn(List.of(legacy));

        RuntimeException ex = assertThrows(RuntimeException.class,
                () -> customerService.createTrip(c, tripRequest(10L, day.plusDays(1), day.plusDays(3))));
        assertTrue(ex.getMessage().contains("already booked"));
    }

    @Test
    void createTrip_hourly_rejectsOverlappingLegacyTripWithoutRentalUnit() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, true, owner(5L));
        car.setPricingMode("BOTH");
        car.setPricePerHour(new BigDecimal("50.00"));
        when(carRepository.findById(10L)).thenReturn(Optional.of(car));

        LocalDate day = LocalDate.now().plusDays(5);
        TripDetail legacy = new TripDetail();
        legacy.setId(93L);
        legacy.setCar(car);
        legacy.setStatus("confirmed");
        legacy.setRentalUnit(null);
        legacy.setStartDate(day);
        legacy.setEndDate(day.plusDays(2));
        when(tripDetailRepository.findByCarId(10L)).thenReturn(List.of(legacy));

        TripRequest req = tripRequest(10L, LocalDate.now(), LocalDate.now());
        req.setRentalUnit("HOUR");
        req.setStartDateTime(day.plusDays(1).atTime(10, 0).toString());
        req.setEndDateTime(day.plusDays(1).atTime(12, 0).toString());

        RuntimeException ex = assertThrows(RuntimeException.class, () -> customerService.createTrip(c, req));
        assertTrue(ex.getMessage().contains("already booked"));
    }

    @Test
    void createTrip_daily_succeedsWhenHourlyTripDoesNotOverlap() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, true, owner(5L));
        car.setPricingMode("BOTH");
        when(carRepository.findById(10L)).thenReturn(Optional.of(car));

        LocalDate day = LocalDate.now().plusDays(5);
        TripDetail hourly = new TripDetail();
        hourly.setId(94L);
        hourly.setCar(car);
        hourly.setStatus("confirmed");
        hourly.setRentalUnit("HOUR");
        hourly.setStartDateTime(day.plusDays(3).atTime(10, 0));
        hourly.setEndDateTime(day.plusDays(3).atTime(12, 0));
        when(tripDetailRepository.findByCarId(10L)).thenReturn(List.of(hourly));
        when(tripDetailRepository.save(any(TripDetail.class))).thenAnswer(inv -> {
            TripDetail t = inv.getArgument(0);
            t.setId(95L);
            return t;
        });
        when(transactionRepository.save(any(Transaction.class))).thenAnswer(inv -> {
            Transaction tx = inv.getArgument(0);
            tx.setId(96L);
            return tx;
        });

        TripResponse resp = customerService.createTrip(c, tripRequest(10L, day, day.plusDays(2)));

        assertEquals("confirmed", resp.getStatus());
    }

    @Test
    void createTrip_throwsWhenRentalUnitInvalid() {
        Customer c = customer(1L, "Amit", "amit@mail.com");
        Car car = car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, true, owner(5L));
        when(carRepository.findById(10L)).thenReturn(Optional.of(car));

        TripRequest req = tripRequest(10L, LocalDate.now(), LocalDate.now());
        req.setRentalUnit("WEEK");

        RuntimeException ex = assertThrows(RuntimeException.class, () -> customerService.createTrip(c, req));
        assertTrue(ex.getMessage().contains("rentalUnit"));
    }

    private TripDetail trip(Customer customer, Long id, String status) {
        TripDetail t = new TripDetail();
        t.setId(id);
        t.setCustomer(customer);
        t.setCar(car(10L, "Honda", "City", new BigDecimal("100.00"), "Pune", true, true, owner(5L)));
        t.setOwner(owner(5L));
        t.setStartDate(LocalDate.now().plusDays(2));
        t.setEndDate(LocalDate.now().plusDays(4));
        t.setTotalAmount(new BigDecimal("200.00"));
        t.setStatus(status);
        t.setCreatedAt(LocalDateTime.of(2026, 7, 9, 9, 0));
        return t;
    }
}
