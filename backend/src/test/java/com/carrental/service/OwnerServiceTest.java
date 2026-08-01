package com.carrental.service;

import com.carrental.dto.CarCreateRequest;
import com.carrental.dto.DocumentRequest;
import com.carrental.dto.DocumentResponse;
import com.carrental.dto.OwnerCarResponse;
import com.carrental.dto.OwnerProfileResponse;
import com.carrental.dto.OwnerTripResponse;
import com.carrental.dto.TransactionResponse;
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
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OwnerServiceTest {

    @Mock
    private OwnerRepository ownerRepository;
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

    @InjectMocks
    private OwnerService ownerService;

    /* ================= fixtures ================= */

    private Owner owner(Long id) {
        Owner o = new Owner();
        o.setId(id);
        o.setName("Ravi Kumar");
        o.setEmail("ravi@owner.com");
        o.setPhone("9876501234");
        o.setCity("Pune");
        o.setVerified(true);
        o.setCreatedAt(LocalDateTime.of(2026, 7, 1, 10, 0));
        return o;
    }

    private Car car(Long id, Owner owner) {
        Car c = new Car();
        c.setId(id);
        c.setOwner(owner);
        c.setMake("Honda");
        c.setModel("City");
        c.setYear(2022);
        c.setFuelType("Petrol");
        c.setTransmission("Manual");
        c.setSeats(5);
        c.setPricePerDay(new BigDecimal("500.00"));
        c.setCity("Pune");
        c.setAvailable(true);
        c.setVerified(false);
        c.setCreatedAt(LocalDateTime.of(2026, 7, 5, 12, 0));
        return c;
    }

    private CarCreateRequest validCarRequest() {
        CarCreateRequest req = new CarCreateRequest();
        req.setMake("Honda");
        req.setModel("City");
        req.setYear(2022);
        req.setPricePerDay(new BigDecimal("500.00"));
        req.setCity("Pune");
        req.setSeats(5);
        req.setMediaUrls(List.of("http://img/a.jpg", "http://img/b.jpg"));
        return req;
    }

    private TripDetail trip(Owner owner, Long id, String status) {
        TripDetail t = new TripDetail();
        t.setId(id);
        t.setCar(car(10L, owner));
        t.setOwner(owner);
        Customer cust = new Customer();
        cust.setId(1L);
        cust.setName("Amit");
        t.setCustomer(cust);
        t.setStartDate(LocalDate.now().plusDays(2));
        t.setEndDate(LocalDate.now().plusDays(4));
        t.setTotalAmount(new BigDecimal("200.00"));
        t.setStatus(status);
        t.setCreatedAt(LocalDateTime.of(2026, 7, 9, 9, 0));
        return t;
    }

    /* ================= PROFILE ================= */

    @Test
    void getProfile_mapsAllFields() {
        Owner o = owner(5L);

        OwnerProfileResponse resp = ownerService.getProfile(o);

        assertEquals(5L, resp.getId());
        assertEquals("Ravi Kumar", resp.getName());
        assertEquals("ravi@owner.com", resp.getEmail());
        assertEquals("9876501234", resp.getPhone());
        assertEquals("Pune", resp.getCity());
        assertTrue(resp.isVerified());
        assertEquals("2026-07-01T10:00", resp.getCreatedAt());
    }

    @Test
    void updateProfile_updatesFieldsAndSaves() {
        Owner o = owner(5L);
        UpdateProfileRequest req = new UpdateProfileRequest();
        req.setName("Ravi Sharma");
        req.setPhone("9000000000");
        req.setCity("Mumbai");

        OwnerProfileResponse resp = ownerService.updateProfile(o, req);

        assertEquals("Ravi Sharma", o.getName());
        assertEquals("9000000000", o.getPhone());
        assertEquals("Mumbai", o.getCity());
        assertNotNull(o.getUpdatedAt());
        verify(ownerRepository).save(o);
        assertEquals("Mumbai", resp.getCity());
    }

    /* ================= MY CARS ================= */

    @Test
    void listMyCars_returnsOwnersCars() {
        Owner o = owner(5L);
        Car c1 = car(1L, o);
        Car c2 = car(2L, o);
        when(carRepository.findByOwnerId(5L)).thenReturn(List.of(c1, c2));

        List<OwnerCarResponse> result = ownerService.listMyCars(o);

        assertEquals(2, result.size());
        assertEquals("Honda", result.get(0).getMake());
        verify(carRepository).findByOwnerId(5L);
    }

    @Test
    void addCar_savesCarAndMedia() {
        Owner o = owner(5L);
        when(carRepository.save(any(Car.class))).thenAnswer(inv -> {
            Car c = inv.getArgument(0);
            c.setId(10L);
            return c;
        });
        when(carMediaRepository.save(any(CarMedia.class))).thenAnswer(inv -> inv.getArgument(0));

        OwnerCarResponse resp = ownerService.addCar(o, validCarRequest());

        ArgumentCaptor<Car> carCaptor = ArgumentCaptor.forClass(Car.class);
        verify(carRepository).save(carCaptor.capture());
        Car saved = carCaptor.getValue();
        assertEquals("Honda", saved.getMake());
        assertEquals(new BigDecimal("500.00"), saved.getPricePerDay());
        assertEquals(o, saved.getOwner());
        assertNotNull(saved.getCreatedAt());

        ArgumentCaptor<CarMedia> mediaCaptor = ArgumentCaptor.forClass(CarMedia.class);
        verify(carMediaRepository, org.mockito.Mockito.times(2)).save(mediaCaptor.capture());
        List<CarMedia> savedMedia = mediaCaptor.getAllValues();
        assertEquals("http://img/a.jpg", savedMedia.get(0).getMediaUrl());
        assertTrue(savedMedia.get(0).isPrimary());
        assertEquals(0, savedMedia.get(0).getDisplayOrder());
        assertEquals("http://img/b.jpg", savedMedia.get(1).getMediaUrl());
        assertFalse(savedMedia.get(1).isPrimary());
        assertEquals(1, savedMedia.get(1).getDisplayOrder());

        assertEquals(10L, resp.getId());
        assertEquals("Honda", resp.getMake());
    }

    @Test
    void addCar_throwsWhenMakeMissing() {
        Owner o = owner(5L);
        CarCreateRequest req = validCarRequest();
        req.setMake(null);

        assertThrows(RuntimeException.class, () -> ownerService.addCar(o, req));
        verify(carRepository, never()).save(any(Car.class));
    }

    @Test
    void addCar_throwsWhenPriceNotPositive() {
        Owner o = owner(5L);
        CarCreateRequest req = validCarRequest();
        req.setPricePerDay(BigDecimal.ZERO);

        RuntimeException ex = assertThrows(RuntimeException.class, () -> ownerService.addCar(o, req));
        assertTrue(ex.getMessage().contains("pricePerDay"));
        verify(carRepository, never()).save(any(Car.class));
    }

    @Test
    void updateCar_updatesFieldsAndReplacesMedia() {
        Owner o = owner(5L);
        Car car = car(7L, o);
        CarMedia oldMedia = new CarMedia();
        oldMedia.setId(1L);
        oldMedia.setCar(car);
        oldMedia.setMediaUrl("http://img/old.jpg");
        oldMedia.setPrimary(true);
        oldMedia.setDisplayOrder(0);
        when(carRepository.findById(7L)).thenReturn(Optional.of(car));
        when(carMediaRepository.findByCarId(7L)).thenReturn(List.of(oldMedia));
        when(carRepository.save(any(Car.class))).thenAnswer(inv -> inv.getArgument(0));
        when(carMediaRepository.save(any(CarMedia.class))).thenAnswer(inv -> inv.getArgument(0));

        CarCreateRequest req = validCarRequest();
        req.setModel("Amaze");
        req.setMediaUrls(List.of("http://img/new.jpg"));
        OwnerCarResponse resp = ownerService.updateCar(o, 7L, req);

        assertEquals("Amaze", car.getModel());
        assertNotNull(car.getUpdatedAt());
        verify(carMediaRepository).deleteAll(List.of(oldMedia));
        ArgumentCaptor<CarMedia> mediaCaptor = ArgumentCaptor.forClass(CarMedia.class);
        verify(carMediaRepository).save(mediaCaptor.capture());
        assertEquals("http://img/new.jpg", mediaCaptor.getValue().getMediaUrl());
        assertEquals("Amaze", resp.getModel());
    }

    @Test
    void updateCar_throwsWhenNotOwnersCar() {
        Owner o = owner(5L);
        Car car = car(7L, owner(9L));
        when(carRepository.findById(7L)).thenReturn(Optional.of(car));

        assertThrows(RuntimeException.class, () -> ownerService.updateCar(o, 7L, validCarRequest()));
        verify(carRepository, never()).save(any(Car.class));
    }

    @Test
    void deleteCar_deletesMediaAndCar() {
        Owner o = owner(5L);
        Car car = car(7L, o);
        CarMedia m1 = new CarMedia();
        m1.setId(1L);
        CarMedia m2 = new CarMedia();
        m2.setId(2L);
        when(carRepository.findById(7L)).thenReturn(Optional.of(car));
        when(carMediaRepository.findByCarId(7L)).thenReturn(List.of(m1, m2));

        ownerService.deleteCar(o, 7L);

        verify(carMediaRepository).deleteAll(List.of(m1, m2));
        verify(carRepository).delete(car);
    }

    @Test
    void deleteCar_throwsWhenNotOwnersCar() {
        Owner o = owner(5L);
        Car car = car(7L, owner(9L));
        when(carRepository.findById(7L)).thenReturn(Optional.of(car));

        assertThrows(RuntimeException.class, () -> ownerService.deleteCar(o, 7L));
        verify(carRepository, never()).delete(any(Car.class));
    }

    /* ================= TRIPS / BOOKINGS ================= */

    @Test
    void listTrips_filtersByStatus() {
        Owner o = owner(5L);
        TripDetail confirmed = trip(o, 100L, "confirmed");
        TripDetail pending = trip(o, 101L, "pending");
        when(tripDetailRepository.findByOwnerId(5L)).thenReturn(List.of(confirmed, pending));

        List<OwnerTripResponse> filtered = ownerService.listTrips(o, "pending");
        assertEquals(1, filtered.size());
        assertEquals(101L, filtered.get(0).getId());

        List<OwnerTripResponse> all = ownerService.listTrips(o, null);
        assertEquals(2, all.size());
    }

    @Test
    void updateTripStatus_throwsWhenInvalidStatus() {
        Owner o = owner(5L);

        RuntimeException ex = assertThrows(RuntimeException.class,
                () -> ownerService.updateTripStatus(o, 100L, "foobar"));
        assertTrue(ex.getMessage().contains("Invalid status"));
    }

    @Test
    void updateTripStatus_throwsWhenNotOwnersTrip() {
        Owner o = owner(5L);
        TripDetail t = trip(owner(9L), 100L, "pending");
        when(tripDetailRepository.findById(100L)).thenReturn(Optional.of(t));

        assertThrows(RuntimeException.class, () -> ownerService.updateTripStatus(o, 100L, "confirmed"));
        verify(tripDetailRepository, never()).save(any(TripDetail.class));
    }

    @Test
    void updateTripStatus_confirmsPendingTrip() {
        Owner o = owner(5L);
        TripDetail t = trip(o, 100L, "pending");
        when(tripDetailRepository.findById(100L)).thenReturn(Optional.of(t));
        when(tripDetailRepository.save(any(TripDetail.class))).thenAnswer(inv -> inv.getArgument(0));

        OwnerTripResponse resp = ownerService.updateTripStatus(o, 100L, "confirmed");

        assertEquals("confirmed", t.getStatus());
        assertNotNull(t.getUpdatedAt());
        verify(tripDetailRepository).save(t);
        assertEquals("confirmed", resp.getStatus());
    }

    @Test
    void updateTripStatus_rejectsWhenAlreadyCancelled() {
        Owner o = owner(5L);
        TripDetail t = trip(o, 100L, "cancelled");
        when(tripDetailRepository.findById(100L)).thenReturn(Optional.of(t));

        RuntimeException ex = assertThrows(RuntimeException.class,
                () -> ownerService.updateTripStatus(o, 100L, "completed"));
        assertTrue(ex.getMessage().contains("already cancelled"));
    }

    /* ================= TRANSACTIONS / EARNINGS ================= */

    @Test
    void listTransactions_mapsResponse() {
        Owner o = owner(5L);
        TripDetail t = trip(o, 100L, "completed");
        Transaction tx = new Transaction();
        tx.setId(200L);
        tx.setTrip(t);
        tx.setAmount(new BigDecimal("300.00"));
        tx.setPlatformFee(new BigDecimal("30.00"));
        tx.setOwnerPayout(new BigDecimal("270.00"));
        tx.setPaymentMethod("upi");
        tx.setStatus("paid");
        tx.setCreatedAt(LocalDateTime.of(2026, 7, 10, 12, 0));
        when(transactionRepository.findByOwnerId(5L)).thenReturn(List.of(tx));

        List<TransactionResponse> result = ownerService.listTransactions(o);

        assertEquals(1, result.size());
        TransactionResponse r = result.get(0);
        assertEquals(100L, r.getTripId());
        assertEquals("Honda City", r.getCarName());
        assertEquals(new BigDecimal("270.00"), r.getOwnerPayout());
        assertEquals("paid", r.getStatus());
    }

    /* ================= DOCUMENTS ================= */

    @Test
    void addDocument_savesWithPendingStatus() {
        Owner o = owner(5L);
        DocumentRequest req = new DocumentRequest();
        req.setDocType("insurance");
        req.setDocUrl("http://docs/insurance.pdf");
        when(documentRepository.save(any(Document.class))).thenAnswer(inv -> {
            Document d = inv.getArgument(0);
            d.setId(50L);
            return d;
        });

        DocumentResponse resp = ownerService.addDocument(o, req);

        assertEquals("insurance", resp.getDocType());
        assertEquals("pending", resp.getVerificationStatus());
        verify(documentRepository).save(any(Document.class));
    }

    @Test
    void addDocument_throwsWhenDocUrlMissing() {
        Owner o = owner(5L);
        DocumentRequest req = new DocumentRequest();
        req.setDocType("insurance");

        assertThrows(RuntimeException.class, () -> ownerService.addDocument(o, req));
        verify(documentRepository, never()).save(any(Document.class));
    }

    @Test
    void deleteDocument_throwsWhenNotOwnersDocument() {
        Owner o = owner(5L);
        Document doc = new Document();
        doc.setId(50L);
        doc.setOwner(owner(9L));
        when(documentRepository.findById(50L)).thenReturn(Optional.of(doc));

        assertThrows(RuntimeException.class, () -> ownerService.deleteDocument(o, 50L));
        verify(documentRepository, never()).delete(any(Document.class));
    }

    @Test
    void deleteDocument_deletesOwnersDocument() {
        Owner o = owner(5L);
        Document doc = new Document();
        doc.setId(50L);
        doc.setOwner(o);
        when(documentRepository.findById(50L)).thenReturn(Optional.of(doc));

        ownerService.deleteDocument(o, 50L);

        verify(documentRepository).delete(doc);
    }

    /* ================= HELPERS ================= */

    @Test
    void findByEmail_throwsWhenOwnerNotFound() {
        when(ownerRepository.findByEmail("nobody@owner.com")).thenReturn(Optional.empty());

        assertThrows(RuntimeException.class, () -> ownerService.findByEmail("nobody@owner.com"));
    }
}
