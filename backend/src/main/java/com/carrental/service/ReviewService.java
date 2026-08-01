package com.carrental.service;

import com.carrental.dto.RatingSummaryResponse;
import com.carrental.dto.ReviewRequest;
import com.carrental.dto.ReviewResponse;
import com.carrental.model.Customer;
import com.carrental.model.Owner;
import com.carrental.model.Review;
import com.carrental.model.TripDetail;
import com.carrental.repository.ReviewRepository;
import com.carrental.repository.TripDetailRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class ReviewService {

    private final ReviewRepository reviewRepository;
    private final TripDetailRepository tripDetailRepository;
    private final NotificationService notificationService;

    public ReviewService(ReviewRepository reviewRepository, TripDetailRepository tripDetailRepository,
                         NotificationService notificationService) {
        this.reviewRepository = reviewRepository;
        this.tripDetailRepository = tripDetailRepository;
        this.notificationService = notificationService;
    }

    /* ---------- submit ---------- */

    /** Customer reviews the owner of a completed trip they rented. */
    @Transactional
    public ReviewResponse submitCustomerReview(Customer customer, Long tripId, ReviewRequest req) {
        TripDetail t = tripDetailRepository.findById(tripId)
                .orElseThrow(() -> new RuntimeException("Trip not found"));
        if (t.getCustomer() == null || !t.getCustomer().getId().equals(customer.getId())) {
            throw new RuntimeException("Trip not found");
        }
        return submit(t, "customer", customer.getName(), req);
    }

    /** Owner reviews the customer of a completed trip on their car. */
    @Transactional
    public ReviewResponse submitOwnerReview(Owner owner, Long tripId, ReviewRequest req) {
        TripDetail t = tripDetailRepository.findById(tripId)
                .orElseThrow(() -> new RuntimeException("Trip not found"));
        if (t.getOwner() == null || !t.getOwner().getId().equals(owner.getId())) {
            throw new RuntimeException("Trip not found");
        }
        return submit(t, "owner", owner.getName(), req);
    }

    private ReviewResponse submit(TripDetail t, String reviewerType, String reviewerName, ReviewRequest req) {
        if (!"completed".equalsIgnoreCase(t.getStatus())) {
            throw new RuntimeException("You can only review a trip after it is completed");
        }
        if (reviewRepository.existsByTripIdAndReviewerType(t.getId(), reviewerType)) {
            throw new RuntimeException("You have already reviewed this trip");
        }
        if (req.getRating() == null || req.getRating() < 1 || req.getRating() > 5) {
            throw new RuntimeException("Rating must be between 1 and 5");
        }
        Review r = new Review();
        r.setTrip(t);
        r.setReviewerType(reviewerType);
        r.setRating(req.getRating());
        r.setComment(req.getComment() == null ? null : req.getComment().trim());
        r.setCreatedAt(LocalDateTime.now());
        reviewRepository.save(r);

        // Notify the other side about their new review
        String carName = t.getCar() == null ? "the trip" : t.getCar().getMake() + " " + t.getCar().getModel();
        if ("customer".equals(reviewerType) && t.getOwner() != null) {
            notificationService.create(t.getOwner(), "review_received", "New review ⭐",
                    reviewerName + " rated your " + carName + " trip " + req.getRating() + "/5."
                            + (r.getComment() != null && !r.getComment().isBlank() ? " \"" + r.getComment() + "\"" : ""),
                    t.getCar() == null ? null : t.getCar().getId());
        } else if ("owner".equals(reviewerType) && t.getCustomer() != null) {
            notificationService.create(t.getCustomer(), "review_received", "New review ⭐",
                    reviewerName + " rated you " + req.getRating() + "/5 for the " + carName + " trip."
                            + (r.getComment() != null && !r.getComment().isBlank() ? " \"" + r.getComment() + "\"" : ""),
                    t.getCar() == null ? null : t.getCar().getId());
        }
        return toResponse(r);
    }

    /* ---------- reads ---------- */

    /** The review this reviewer already left for a trip, or null. */
    public ReviewResponse myReview(Long tripId, String reviewerType) {
        return reviewRepository.findByTripIdAndReviewerType(tripId, reviewerType)
                .map(this::toResponse)
                .orElse(null);
    }

    /** Reviews an owner has received from customers. */
    public List<ReviewResponse> receivedByOwner(Long ownerId) {
        return reviewRepository.findByTripOwnerIdAndReviewerType(ownerId, "customer").stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    /** Reviews a customer has received from owners. */
    public List<ReviewResponse> receivedByCustomer(Long customerId) {
        return reviewRepository.findByTripCustomerIdAndReviewerType(customerId, "owner").stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    /** Owner's aggregate rating from customer reviews. */
    public RatingSummaryResponse ownerRating(Long ownerId) {
        return RatingSummaryResponse.of(reviewRepository.findByTripOwnerIdAndReviewerType(ownerId, "customer").stream()
                .map(Review::getRating)
                .collect(Collectors.toList()));
    }

    /** Customer's aggregate rating from owner reviews. */
    public RatingSummaryResponse customerRating(Long customerId) {
        return RatingSummaryResponse.of(reviewRepository.findByTripCustomerIdAndReviewerType(customerId, "owner").stream()
                .map(Review::getRating)
                .collect(Collectors.toList()));
    }

    private ReviewResponse toResponse(Review r) {
        String reviewerName = null;
        TripDetail t = r.getTrip();
        if (t != null) {
            reviewerName = "customer".equals(r.getReviewerType())
                    ? (t.getCustomer() == null ? null : t.getCustomer().getName())
                    : (t.getOwner() == null ? null : t.getOwner().getName());
        }
        return new ReviewResponse(r.getId(),
                t == null ? null : t.getId(),
                r.getReviewerType(), reviewerName, r.getRating(), r.getComment(),
                r.getCreatedAt() == null ? null : r.getCreatedAt().toString());
    }
}
