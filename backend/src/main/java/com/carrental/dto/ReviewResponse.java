package com.carrental.dto;

public class ReviewResponse {
    private Long id;
    private Long tripId;
    private String reviewerType; // "customer" or "owner"
    private String reviewerName;
    private int rating;
    private String comment;
    private String createdAt;

    public ReviewResponse() {}

    public ReviewResponse(Long id, Long tripId, String reviewerType, String reviewerName,
                          int rating, String comment, String createdAt) {
        this.id = id;
        this.tripId = tripId;
        this.reviewerType = reviewerType;
        this.reviewerName = reviewerName;
        this.rating = rating;
        this.comment = comment;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getTripId() { return tripId; }
    public void setTripId(Long tripId) { this.tripId = tripId; }
    public String getReviewerType() { return reviewerType; }
    public void setReviewerType(String reviewerType) { this.reviewerType = reviewerType; }
    public String getReviewerName() { return reviewerName; }
    public void setReviewerName(String reviewerName) { this.reviewerName = reviewerName; }
    public int getRating() { return rating; }
    public void setRating(int rating) { this.rating = rating; }
    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
