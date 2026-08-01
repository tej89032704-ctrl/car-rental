package com.carrental.dto;

public class OwnerProfileResponse {
    private Long id;
    private String name;
    private String email;
    private String phone;
    private String city;
    private boolean verified;
    private String createdAt;

    public OwnerProfileResponse() {}

    public OwnerProfileResponse(Long id, String name, String email, String phone, String city,
                                boolean verified, String createdAt) {
        this.id = id;
        this.name = name;
        this.email = email;
        this.phone = phone;
        this.city = city;
        this.verified = verified;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
    public boolean isVerified() { return verified; }
    public void setVerified(boolean verified) { this.verified = verified; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
