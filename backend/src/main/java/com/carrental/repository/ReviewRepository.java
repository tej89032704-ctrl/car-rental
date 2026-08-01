package com.carrental.repository;

import com.carrental.model.Review;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ReviewRepository extends JpaRepository<Review, Long> {
    Optional<Review> findByTripIdAndReviewerType(Long tripId, String reviewerType);
    boolean existsByTripIdAndReviewerType(Long tripId, String reviewerType);
    /** Reviews given to the owner of these trips (reviewerType = "customer"). */
    List<Review> findByTripOwnerIdAndReviewerType(Long ownerId, String reviewerType);
    /** Reviews given to the customer of these trips (reviewerType = "owner"). */
    List<Review> findByTripCustomerIdAndReviewerType(Long customerId, String reviewerType);
}
