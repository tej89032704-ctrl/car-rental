package com.carrental.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "reviews",
        uniqueConstraints = @UniqueConstraint(name = "uk_review_trip_side", columnNames = {"trip_id", "reviewer_type"}))
public class Review {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "trip_id", nullable = false)
    private TripDetail trip;

    /** "customer" = the renter reviewing the owner; "owner" = the owner reviewing the renter. */
    @Column(name = "reviewer_type", nullable = false)
    private String reviewerType;

    @Column(nullable = false)
    private int rating; // 1..5

    @Column(length = 600)
    private String comment;

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public TripDetail getTrip() { return trip; }
    public void setTrip(TripDetail trip) { this.trip = trip; }
    public String getReviewerType() { return reviewerType; }
    public void setReviewerType(String reviewerType) { this.reviewerType = reviewerType; }
    public int getRating() { return rating; }
    public void setRating(int rating) { this.rating = rating; }
    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
