package com.carrental.dto;

public class AdminUserResponse {
    private Long id;
    private String name;
    private String email;
    private String city;
    private String role; // "customer" or "owner"
    private boolean verified;
    private long pendingDocs;
    private String createdAt;

    public AdminUserResponse() {}

    public AdminUserResponse(Long id, String name, String email, String city, String role,
                             boolean verified, long pendingDocs, String createdAt) {
        this.id = id;
        this.name = name;
        this.email = email;
        this.city = city;
        this.role = role;
        this.verified = verified;
        this.pendingDocs = pendingDocs;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public boolean isVerified() { return verified; }
    public void setVerified(boolean verified) { this.verified = verified; }
    public long getPendingDocs() { return pendingDocs; }
    public void setPendingDocs(long pendingDocs) { this.pendingDocs = pendingDocs; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
