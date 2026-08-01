package com.carrental.service;

import com.carrental.dto.ReviewRequest;
import com.carrental.dto.ReviewResponse;
import com.carrental.model.Car;
import com.carrental.model.Customer;
import com.carrental.model.Owner;
import com.carrental.model.Review;
import com.carrental.model.TripDetail;
import com.carrental.repository.ReviewRepository;
import com.carrental.repository.TripDetailRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ReviewServiceTest {

    @Mock
    private ReviewRepository reviewRepository;
    @Mock
    private TripDetailRepository tripDetailRepository;
    @Mock
    private NotificationService notificationService;

    @InjectMocks
    private ReviewService reviewService;

    private Customer customer;
    private Owner owner;
    private Car car;
    private TripDetail trip;

    @BeforeEach
    void setUp() {
        customer = new Customer();
        customer.setId(1L);
        customer.setName("Amit");

        owner = new Owner();
        owner.setId(2L);
        owner.setName("Ravi");

        car = new Car();
        car.setId(10L);
        car.setMake("Honda");
        car.setModel("City");

        trip = new TripDetail();
        trip.setId(100L);
        trip.setCar(car);
        trip.setCustomer(customer);
        trip.setOwner(owner);
        trip.setStatus("completed");
    }

    private ReviewRequest request(int rating, String comment) {
        ReviewRequest req = new ReviewRequest();
        req.setRating(rating);
        req.setComment(comment);
        return req;
    }

    private Review review(int rating, String reviewerType) {
        Review r = new Review();
        r.setId(50L);
        r.setTrip(trip);
        r.setReviewerType(reviewerType);
        r.setRating(rating);
        r.setComment("Nice");
        return r;
    }

    /* ---------- submitCustomerReview ---------- */

    @Test
    void submitCustomerReview_success_savesAndNotifiesOwner() {
        when(tripDetailRepository.findById(100L)).thenReturn(Optional.of(trip));
        when(reviewRepository.existsByTripIdAndReviewerType(100L, "customer")).thenReturn(false);
        when(reviewRepository.save(any(Review.class))).thenAnswer(inv -> {
            Review r = inv.getArgument(0);
            r.setId(50L);
            return r;
        });

        ReviewResponse res = reviewService.submitCustomerReview(customer, 100L, request(5, "Great trip!"));

        assertNotNull(res);
        assertEquals(5, res.getRating());
        assertEquals("customer", res.getReviewerType());
        assertEquals(100L, res.getTripId());
        verify(reviewRepository).save(any(Review.class));
        verify(notificationService).create(eq(owner), eq("review_received"), anyString(), anyString(), eq(10L));
    }

    @Test
    void submitCustomerReview_rejectsNonCompletedTrip() {
        trip.setStatus("confirmed");
        when(tripDetailRepository.findById(100L)).thenReturn(Optional.of(trip));

        assertThrows(RuntimeException.class,
                () -> reviewService.submitCustomerReview(customer, 100L, request(5, "ok")),
                "You can only review a trip after it is completed");
        verify(reviewRepository, never()).save(any(Review.class));
    }

    @Test
    void submitCustomerReview_rejectsWrongCustomer() {
        Customer other = new Customer();
        other.setId(99L);
        other.setName("Other");
        when(tripDetailRepository.findById(100L)).thenReturn(Optional.of(trip));

        assertThrows(RuntimeException.class,
                () -> reviewService.submitCustomerReview(other, 100L, request(5, "ok")),
                "Trip not found");
    }

    @Test
    void submitCustomerReview_rejectsDuplicateReview() {
        when(tripDetailRepository.findById(100L)).thenReturn(Optional.of(trip));
        when(reviewRepository.existsByTripIdAndReviewerType(100L, "customer")).thenReturn(true);

        assertThrows(RuntimeException.class,
                () -> reviewService.submitCustomerReview(customer, 100L, request(5, "ok")),
                "You have already reviewed this trip");
    }

    @Test
    void submitCustomerReview_rejectsRatingOutOfRange() {
        when(tripDetailRepository.findById(100L)).thenReturn(Optional.of(trip));
        when(reviewRepository.existsByTripIdAndReviewerType(100L, "customer")).thenReturn(false);

        assertThrows(RuntimeException.class,
                () -> reviewService.submitCustomerReview(customer, 100L, request(0, "ok")),
                "Rating must be between 1 and 5");
        assertThrows(RuntimeException.class,
                () -> reviewService.submitCustomerReview(customer, 100L, request(6, "ok")),
                "Rating must be between 1 and 5");
    }

    @Test
    void submitCustomerReview_doesNotNotifyWhenNoOwner() {
        trip.setOwner(null);
        when(tripDetailRepository.findById(100L)).thenReturn(Optional.of(trip));
        when(reviewRepository.existsByTripIdAndReviewerType(100L, "customer")).thenReturn(false);
        when(reviewRepository.save(any(Review.class))).thenAnswer(inv -> inv.getArgument(0));

        reviewService.submitCustomerReview(customer, 100L, request(4, "ok"));

        verify(notificationService, never()).create(any(Owner.class), anyString(), anyString(), anyString(), any(Long.class));
    }

    /* ---------- submitOwnerReview ---------- */

    @Test
    void submitOwnerReview_success_savesAndNotifiesCustomer() {
        when(tripDetailRepository.findById(100L)).thenReturn(Optional.of(trip));
        when(reviewRepository.existsByTripIdAndReviewerType(100L, "owner")).thenReturn(false);
        when(reviewRepository.save(any(Review.class))).thenAnswer(inv -> {
            Review r = inv.getArgument(0);
            r.setId(50L);
            return r;
        });

        ReviewResponse res = reviewService.submitOwnerReview(owner, 100L, request(4, "Great guest"));

        assertNotNull(res);
        assertEquals(4, res.getRating());
        assertEquals("owner", res.getReviewerType());
        verify(notificationService).create(eq(customer), eq("review_received"), anyString(), anyString(), eq(10L));
    }

    @Test
    void submitOwnerReview_rejectsWrongOwner() {
        Owner other = new Owner();
        other.setId(99L);
        other.setName("Other");
        when(tripDetailRepository.findById(100L)).thenReturn(Optional.of(trip));

        assertThrows(RuntimeException.class,
                () -> reviewService.submitOwnerReview(other, 100L, request(5, "ok")),
                "Trip not found");
    }

    @Test
    void submitOwnerReview_rejectsNonCompletedTrip() {
        trip.setStatus("pending");
        when(tripDetailRepository.findById(100L)).thenReturn(Optional.of(trip));

        assertThrows(RuntimeException.class,
                () -> reviewService.submitOwnerReview(owner, 100L, request(5, "ok")));
    }

    /* ---------- reads ---------- */

    @Test
    void myReview_returnsExistingReview() {
        when(reviewRepository.findByTripIdAndReviewerType(100L, "customer"))
                .thenReturn(Optional.of(review(5, "customer")));

        ReviewResponse res = reviewService.myReview(100L, "customer");

        assertNotNull(res);
        assertEquals(5, res.getRating());
        assertEquals("customer", res.getReviewerType());
        assertEquals("Amit", res.getReviewerName());
    }

    @Test
    void myReview_returnsNullWhenNone() {
        when(reviewRepository.findByTripIdAndReviewerType(100L, "customer"))
                .thenReturn(Optional.empty());

        assertNull(reviewService.myReview(100L, "customer"));
    }

    @Test
    void receivedByOwner_listsCustomerReviews() {
        when(reviewRepository.findByTripOwnerIdAndReviewerType(2L, "customer"))
                .thenReturn(Arrays.asList(review(5, "customer"), review(4, "customer")));

        List<ReviewResponse> res = reviewService.receivedByOwner(2L);

        assertEquals(2, res.size());
        assertTrue(res.stream().allMatch(r -> "customer".equals(r.getReviewerType())));
    }

    @Test
    void receivedByCustomer_listsOwnerReviews() {
        when(reviewRepository.findByTripCustomerIdAndReviewerType(1L, "owner"))
                .thenReturn(Collections.singletonList(review(4, "owner")));

        List<ReviewResponse> res = reviewService.receivedByCustomer(1L);

        assertEquals(1, res.size());
        assertEquals("owner", res.get(0).getReviewerType());
    }

    /* ---------- rating summaries ---------- */

    @Test
    void ownerRating_averagesCustomerReviews() {
        when(reviewRepository.findByTripOwnerIdAndReviewerType(2L, "customer"))
                .thenReturn(Arrays.asList(review(5, "customer"), review(4, "customer")));

        var res = reviewService.ownerRating(2L);

        assertEquals(4.5, res.getAverage());
        assertEquals(2, res.getCount());
    }

    @Test
    void ownerRating_emptyIsZero() {
        when(reviewRepository.findByTripOwnerIdAndReviewerType(2L, "customer"))
                .thenReturn(Collections.emptyList());

        var res = reviewService.ownerRating(2L);

        assertEquals(0.0, res.getAverage());
        assertEquals(0, res.getCount());
    }

    @Test
    void customerRating_averagesOwnerReviews() {
        when(reviewRepository.findByTripCustomerIdAndReviewerType(1L, "owner"))
                .thenReturn(Arrays.asList(review(3, "owner"), review(5, "owner")));

        var res = reviewService.customerRating(1L);

        assertEquals(4.0, res.getAverage());
        assertEquals(2, res.getCount());
    }
}
