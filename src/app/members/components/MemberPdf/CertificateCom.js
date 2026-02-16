import NotoSansDevanagari from '@/app/api/helper/static/font/NotoSansDevanagari';
import NotoSansDevanagariBold from '@/app/api/helper/static/font/NotoSansDevanagariBold';
import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import React from 'react'

Font.register({
  family: 'NotoSansDevanagari',
  fonts: [
    {
      src: NotoSansDevanagari,
      fontWeight: 'normal',
    },
    {
      src: NotoSansDevanagariBold,
      fontWeight: 'bold',
    }
  ]
});

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    fontFamily: 'NotoSansDevanagari',
    padding: 5,
    width: '210mm',
    height: '148mm',
  },
  outerView: {
    width: '100%',
    height: "100%",
    borderWidth: 4,
    borderColor: "#d4af37",
    borderStyle: "solid",
    position: 'relative',
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
  },
  
  // Header Styles
  topText: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  smallText: {
    fontSize: 9,
    color: '#D3292F',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  headerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  logoImage: {
    width: 70,
    height: 62,
    borderRadius: 4,
  },
  logoImage1: {
    width: 70,
    height: 62,
    borderRadius: 4,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  mainTitle: {
    fontSize: 16,
    color: '#1B385A',
    fontWeight: 'bold',
    marginBottom: 3,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  addressBox: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 2,
  },
  addresshLabel: {
    color: '#D3292F',
    fontSize: 8,
    fontWeight: 600
  },
  addressValue: {
    color: '#000',
    fontSize: 8,
    textAlign: 'center',
    width: '90%',
  },
  phoneNo: {
    fontWeight: 900,
    color: "#1B385A"
  },
  imageText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: "#1B385A",
    marginTop: 2,
  },
  imageBox: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2
  },
  headingBox: {
    flexDirection: 'row',
    width: '80%',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 3
  },
  stateText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: "#1B385A"
  },
  schemeBox: {
    backgroundColor: '#D3292F',
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: 12,
    alignSelf: 'center',
  },
  schemeText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: 'bold',
    letterSpacing: 0.4,
    marginTop: 1,
  },
  watermark: {
    position: 'absolute',
    top: '40mm',
    left: '54mm',
    width: '90mm',
    height: '70mm',
    opacity: 0.08,
    zIndex: 0,
  },
  
  // ========== IMPROVED CONTENT SECTION ==========
  
  // Member Info Row
  memberInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
    marginTop: 10,
    paddingHorizontal: 4,
  },
  
  memberIdText: {
    fontSize: 10,
    color: '#000',
    fontWeight: 'normal',
  },
  
  memberIdValue: {
    fontSize: 10,
    color: '#D3292F',
    fontWeight: 'bold',
  },
  
  schemeNameText: {
    fontSize: 11,
    color: '#000',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  dateLabel: {
    fontSize: 10,
    color: '#000',
    fontWeight: 'normal',
  },
  
  dateValue: {
    fontSize: 10,
    color: '#D3292F',
    fontWeight: 'bold',
  },
  
  // Main Content Section with Controlled Height
  contentSection: {
    flexDirection: 'row',
    paddingHorizontal: 4,
    marginTop: 2,
    gap: 10,
    marginBottom: 4,
  },
  
  // Left Side - All Details in TWO COLUMNS
  leftDetails: {
    flex: 3,
    paddingRight: 6,
  },
  
  detailsWrapper: {
    flexDirection: 'row',
    gap: 12,
  },
  
  leftColumn: {
    flex: 1,
  },
  
  rightColumn: {
    flex: 1,
  },
  
  // Field Row Styles - Reduced spacing
  detailRow: {
    flexDirection: 'row',
    marginBottom: 4,
    alignItems: 'flex-start',
  },
  
  detailLabel: {
    fontSize: 10,
    color: '#000',
    fontWeight: 'normal',
    width: '30%',
    textAlign: 'left',
  },
  
  detailColon: {
    fontSize: 10,
    color: '#000',
    fontWeight: 'normal',
    marginHorizontal: 2,
  },
  
  detailValue: {
    fontSize: 10,
    color: '#D3292F',
    fontWeight: 'bold',
    flex: 1,
    textTransform: 'uppercase',
  },
  
  detailValueNormal: {
    fontSize: 10,
    color: '#000',
    fontWeight: 'normal',
    flex: 1,
    textTransform: 'uppercase',
  },
  
  // Photo Section - Right Side (Only Photo)
  photoSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  
  memberPhotoContainer: {
    width: 95,
    height: 115,
    borderWidth: 2,
    borderColor: '#1B385A',
    borderRadius: 2,
    overflow: 'hidden',
  },
  
  memberPhoto: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  
  noPhotoContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  noPhotoText: {
    color: '#999',
    fontSize: 8,
  },
  
  // Scheme Information - Compact
  schemeInfo: {
    paddingHorizontal: 4,
    marginTop: 4,
    marginBottom: 6,
  },
  
  contributionText: {
    fontSize: 10,
    color: '#000',
    fontWeight: 'bold',
    marginBottom: 2,
    textAlign: 'left',
  },
  
  rulesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  
  rulesLabel: {
    fontSize: 10,
    color: '#D3292F',
    fontWeight: 'bold',
    marginRight: 4,
  },
  
  rulesText: {
    fontSize: 10,
    color: '#000',
    lineHeight: 1.3,
    flex: 1,
  },
  
  // ========== IMPROVED FOOTER SECTION ==========
  footer: {
    marginTop: 'auto',
    paddingTop: 6,
    paddingBottom: 2,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: '#1B385A',
    position:'relative',
    width:'100%'
  },
  
  footerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
     width:'100%'
  },
  
  founderSection: {
    paddingRight: 8,
    alignItems:'center'
  },
  
  founderLabel: {
    fontSize: 13,
    color: '#1B385A',
    fontWeight: 'bold',
    marginBottom: 2,
    textAlign:'center'
  },
  
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    width: 110,
    marginTop: 16,
    marginBottom: 2,
  },
  
  founderName: {
    fontSize: 11,
    color: '#1B385A',
    fontWeight: 'normal',
    textTransform:'uppercase',
     textAlign:'center'
  },
  
  centerFooter: {
    flex: 2,
    alignItems: 'center',
    paddingHorizontal: 8,
    position:'absolute',
    top:30,
    left:100,
    width:'50%'
  },
  
  
  trustNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    gap: 8,
  },
  
  trustNameFooter: {
    fontSize: 12,
    color: '#1B385A',
    fontWeight: '600',
    textAlign: 'center',
  },
  
  founderNameInline: {
    fontSize: 11,
    color: '#000',
    fontWeight: 'bold',
  },
  
  footerNote: {
    fontSize: 10,
    color: '#487BA3',
    textAlign: 'center',
    marginBottom: 1,
    lineHeight: 1.3,
    fontWeight:'bold'
  },
  
  rightFooter: {
    alignItems: 'center',
  },
  
  founderLabelRight: {
    fontSize: 13,
    color: '#D3292F',
    fontWeight: 'bold',
    marginBottom: 2,
  },
});

const CertificateCom = ({ data }) => {
  // Format the date
  const formatDate = (dateString) => {
    if (!dateString) return '09-01-2026';
    return dateString;
  };

  return (
    <Document>
      <Page size={{ width: '210mm', height: '148mm' }} style={styles.page}>
        <View style={styles.outerView}>
          <Image
            src="/Images/logoT.png"
            style={styles.watermark}
          />

          {/* Header Section */}
          <View style={styles.topText}>
            <Text style={styles.smallText}>॥ श्री गणेशाय नमः ॥</Text>
            <Text style={styles.smallText}>॥  श्री शनिदेवाय नमः ॥</Text>
            <Text style={styles.smallText}>॥  श्री सांवलाजी महाराज नमः  ॥</Text>
          </View>

          <View style={styles.headerSection}>
            <View style={styles.imageBox}>
              <Image
                src="/Images/logoT.png" 
                style={styles.logoImage}
              />
              <Text style={styles.imageText}>SINCE: 2024</Text>
            </View>

            <View style={styles.centerContent}>
              <Text style={styles.mainTitle}>श्री क्षत्रिय घांची मोदी समाज सेवा संस्थान ट्रस्ट</Text>

              <View style={styles.addressBox}>
                <Text style={styles.addresshLabel}> हेड ऑफिस : </Text>
                <Text style={styles.addressValue}>
                  68, वृंदावन शॉपिंग सेंटर, गुजरात हाउसिंग बोर्ड बी. एस. स्कूल के पास,
                  चांदखेडा, साबरमती, अहमदाबाद-382424 (O) 9898535345
                </Text>
              </View>

              <View style={styles.addressBox}>
                <Text style={styles.addresshLabel}> संपर्क सूत्र : </Text>
                <Text style={[styles.addressValue, styles.phoneNo]}>
                  9374934004, 9825289998, 9426517804, 9824017977
                </Text>
              </View>

              <View style={styles.headingBox}>
                <Text style={styles.stateText}>राजस्थान </Text>
                <View style={styles.schemeBox}>
                  <Text style={styles.schemeText}>सदस्यता प्रमाण पत्र</Text>
                </View>
                <Text style={styles.stateText}>गुजरात</Text>
              </View>
            </View>

            <View style={styles.imageBox}>
              <Image
                src="/Images/sanidevImg.jpeg"
                style={styles.logoImage1}
              />
              <Text style={styles.imageText}>Reg. No: A/5231</Text>
            </View>
          </View>

          {/* Member ID, Scheme Name and Date Row */}
          <View style={styles.memberInfoRow}>
            <Text style={styles.memberIdText}>
              सदस्य क्रमांक : <Text style={styles.memberIdValue}>{data?.registrationNumber || 'S1001511'}</Text>
            </Text>
            <Text style={styles.schemeNameText}>
              Suraksha Sahyog Yojna Group - Part 2
            </Text>
            <View style={styles.dateContainer}>
              <Text style={styles.dateLabel}>दिनांक : </Text>
              <Text style={styles.dateValue}>{formatDate(data?.dateJoin)}</Text>
            </View>
          </View>

          {/* Main Content Section */}
          <View style={styles.contentSection}>
            {/* Left Side - All Details in Two Columns */}
            <View style={styles.leftDetails}>
              <View style={styles.detailsWrapper}>
                {/* Left Column */}
                <View style={styles.leftColumn}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>नाम</Text>
                    <Text style={styles.detailColon}>:</Text>
                    <Text style={styles.detailValue}>
                      {data?.displayName || 'रामलालजी'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>पिता का नाम</Text>
                    <Text style={styles.detailColon}>:</Text>
                    <Text style={styles.detailValueNormal}>
                      {data?.fatherName || 'लछारामजी'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>फोन न.</Text>
                    <Text style={styles.detailColon}>:</Text>
                    <Text style={styles.detailValue}>
                      {data?.phone || '8005948238'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>जाति</Text>
                    <Text style={styles.detailColon}>:</Text>
                    <Text style={styles.detailValueNormal}>
                      {data?.caste || 'घाँची'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>जन्मतिथि</Text>
                    <Text style={styles.detailColon}>:</Text>
                    <Text style={styles.detailValueNormal}>
                      {data?.dobDate || '01-01-1974'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>गोत्र</Text>
                    <Text style={styles.detailColon}>:</Text>
                    <Text style={styles.detailValueNormal}>
                      {data?.surname || 'घांची'}
                    </Text>
                  </View>
                </View>

                {/* Right Column */}
                <View style={styles.rightColumn}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>वारिसदार</Text>
                    <Text style={styles.detailColon}>:</Text>
                    <Text style={styles.detailValueNormal}>
                      {data?.guardian || 'चंपादेवी'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>संबंध</Text>
                    <Text style={styles.detailColon}>:</Text>
                    <Text style={styles.detailValueNormal}>
                      {data?.guardianRelation || 'पति-पत्नी'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>पता</Text>
                    <Text style={styles.detailColon}>:</Text>
                    <Text style={styles.detailValueNormal}>
                      {data?.currentAddress || data?.village || 'हेमावास'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>गांव & जिला</Text>
                    <Text style={styles.detailColon}>:</Text>
                    <Text style={styles.detailValueNormal}>
                      {`${data?.village || 'पाली'}${data?.district ? `, ${data.district}` : ', ( Pali )'}`}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>राज्य</Text>
                    <Text style={styles.detailColon}>:</Text>
                    <Text style={styles.detailValue}>
                      {data?.state || 'Rajasthan'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>आधार कार्ड</Text>
                    <Text style={styles.detailColon}>:</Text>
                    <Text style={styles.detailValue}>
                      {data?.aadhaarNo || '7459-0183-8700'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Right Side - Only Photo */}
            <View style={styles.photoSection}>
              <View style={styles.memberPhotoContainer}>
                {data?.photoURL ? (
                  <Image
                    src={data.photoURL}
                    style={styles.memberPhoto}
                  />
                ) : (
                  <View style={styles.noPhotoContainer}>
                    <Text style={styles.noPhotoText}>No Photo</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Scheme Information */}
          <View style={styles.schemeInfo}>
            <Text style={styles.contributionText}>
              सहयोग राशि : ₹ 200 रूपये प्रत्येक कार्यक्रम पर लागु।
            </Text>

            <View style={styles.rulesRow}>
              <Text style={styles.rulesLabel}>योजना नियम :</Text>
              <Text style={styles.rulesText}>
                इस ग्रुप के सदस्य के देहावसान पर - 3 माह तक कोई राशि नहीं, 3+ से 12 माह
                में ₹61,000, 1 वर्ष बाद सदस्य अनुसार राशि दी जाएगी
              </Text>
            </View>
          </View>

          {/* Improved Footer Section */}
          <View style={styles.footer}>
            <View style={styles.footerTop}>
              <View style={styles.founderSection}>
                <Text style={styles.founderLabel}>कार्यकर्ता</Text>
                <Text style={styles.founderName}>{data?.agentName || ''}</Text>
                {/* <Text style={styles.founderName}>{data?.agentPhone || ''}</Text> */}

              </View>

              <View style={styles.centerFooter}>
                <Text style={styles.footerNote}>आपका सहयोग ही समाज की प्रगति है !</Text>
                <Text style={styles.footerNote}>Exclusive jurisdiction Ahmedabad, Gujarat</Text>
              </View>

              <View style={styles.rightFooter}>
                <Text style={styles.founderLabelRight}>संस्थापक</Text>
                   <Text style={styles.trustNameFooter}>
                    श्री क्षत्रिय घांची मोदी समाज सेवा संस्थान ट्रस्ट
                  </Text>
                     <Text style={styles.trustNameFooter}>
                    अहमदाबाद
                  </Text>
           
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  )
}

export default CertificateCom;